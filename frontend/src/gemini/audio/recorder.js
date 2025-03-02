import { arrayBufferToBase64 } from '../utils/utils.js';

/**
 * AudioRecorder manages the capture and processing of audio input from the user's microphone.
 * It uses the Web Audio API and AudioWorklet to process audio in real-time with minimal latency.
 * The processed audio is converted to base64-encoded Int16 format suitable for transmission.
 */
export class AudioRecorder extends EventTarget {
    /**
     * Creates an AudioRecorder instance
     */
    constructor() {
        super();
        // Core audio configuration
        this.sampleRate = 16000;         // Sample rate in Hz   
        this.stream = null;              // MediaStream from getUserMedia
        this.audioContext = null;        // AudioContext for Web Audio API
        this.source = null;              // MediaStreamAudioSourceNode
        this.processor = null;           // AudioWorkletNode for processing
        this.onAudioData = null;         // Callback for processed audio chunks
        this.isRecording = false;        // Recording state flag
        this.isSuspended = false;        // Mic suspension state
    }

    // In your audio-recorder.js file
    async initializeAudioWorklet() {
        // Create a blob with the audio worklet processor code
        const workletProcessorBlob = new Blob([`
        // Audio worklet processor code goes here
        /**
         * AudioProcessingWorklet handles real-time audio processing in a dedicated thread.
         * It converts incoming Float32 audio samples to Int16 format for efficient network transmission
         * and processing by speech recognition systems.
         */
        class AudioProcessingWorklet extends AudioWorkletProcessor {
            /**
             * Initializes the audio processing worklet with a fixed-size buffer
             * Buffer size of 2048 samples provides a good balance between latency and processing efficiency
             */
            constructor() {
                super();
                // Pre-allocate buffer for Int16 samples to avoid garbage collection
                this.buffer = new Int16Array(2048);
                this.bufferWriteIndex = 0;
                this.sampleRate = 16000;
            }

            /**
             * Processes incoming audio data in chunks
             * @param {Array<Float32Array[]>} inputs - Array of input channels, each containing Float32 audio samples
             * @returns {boolean} - Return true to keep the processor alive
             */
            process(inputs) {
                // Process only if we have audio data (first channel of first input)
                if (inputs[0].length) {
                    const channel0 = inputs[0][0];
                    this.processChunk(channel0);
                }
                return true;
            }

            /**
             * Sends the accumulated audio buffer to the main thread and resets the write position
             * Uses SharedArrayBuffer for zero-copy transfer of audio data
             */
            sendAndClearBuffer() {
                this.port.postMessage({
                    event: 'chunk',
                    data: {
                        // Transfer only the filled portion of the buffer
                        int16arrayBuffer: this.buffer.slice(0, this.bufferWriteIndex).buffer,
                    },
                });
                this.bufferWriteIndex = 0;
            }

            /**
             * Converts Float32 audio samples to Int16 format and accumulates them in the buffer
             * Float32 range [-1.0, 1.0] is mapped to Int16 range [-32768, 32767]
             * @param {Float32Array} float32Array - Input audio samples in Float32 format
             */
            processChunk(float32Array) {
                try {
                    for (let i = 0; i < float32Array.length; i++) {
                        // Convert Float32 to Int16 with proper rounding and clamping
                        const int16Value = Math.max(-32768, Math.min(32767, Math.floor(float32Array[i] * 32768)));
                        this.buffer[this.bufferWriteIndex++] = int16Value;

                        // Send buffer when full to maintain continuous audio stream
                        if (this.bufferWriteIndex >= this.buffer.length) {
                            this.sendAndClearBuffer();
                        }
                    }

                    // Handle any remaining samples in buffer
                    if (this.bufferWriteIndex >= this.buffer.length) {
                        this.sendAndClearBuffer();
                    }
                } catch (error) {
                    // Forward processing errors to main thread for handling
                    this.port.postMessage({
                        event: 'error',
                        error: {
                            message: error.message,
                            stack: error.stack
                        }
                    });
                }
            }
        }

        // Register the worklet processor with a unique name for reference in AudioWorkletNode
        registerProcessor('audio-recorder-worklet', AudioProcessingWorklet);
        `], { type: 'application/javascript' });
        
        // Create a URL for the blob
        const workletUrl = URL.createObjectURL(workletProcessorBlob);
        
        try {
        // Load the worklet from the blob URL
        await this.audioContext.audioWorklet.addModule(workletUrl);
        console.log('Audio worklet loaded successfully');
        } catch (error) {
        console.error('Error loading audio worklet:', error);
        } finally {
        // Clean up the blob URL
        URL.revokeObjectURL(workletUrl);
        }
    }  

    /**
     * Initializes and starts audio capture pipeline
     * Sets up audio context, worklet processor, and media stream
     * @param {Function} onAudioData - Callback receiving base64-encoded audio chunks
     */
    async start(onAudioData) {
        this.onAudioData = onAudioData;
        try {
            // Request microphone access with specific echo cancelation and noise reduction
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: this.sampleRate,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            // Initialize Web Audio API context and nodes
            this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
            this.source = this.audioContext.createMediaStreamSource(this.stream);

            // Load and initialize audio processing worklet
            await this.initializeAudioWorklet();
            // await this.audioContext.audioWorklet.addModule('js/audio/worklets/audio-processor.js');
            this.processor = new AudioWorkletNode(this.audioContext, 'audio-recorder-worklet');
            
            // Handle processed audio chunks from worklet
            this.processor.port.onmessage = (event) => {
                if (!this.isRecording) return;
                
                if (event.data.event === 'chunk' && this.onAudioData) {
                    const base64Data = arrayBufferToBase64(event.data.data.int16arrayBuffer);
                    this.onAudioData(base64Data);
                }
            };

            // Connect audio processing pipeline
            this.source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            this.isRecording = true;
        } catch (error) {
            throw new Error('Failed to start audio recording:' + error);
        }
    }

    /**
     * Gracefully stops audio recording and cleans up resources
     * Stops media tracks and logs the operation completion
     */
    stop() {
        try {
            if (!this.isRecording) {
                return;
            }

            // Stop all active media tracks
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }

            this.isRecording = false;
            console.info('Audio recording stopped');

            if (this.audioContext) {
                this.audioContext.close();
            }
        } catch (error) {
            throw new Error('Failed to stop audio recording:' + error);
        }
    }

    /**
     * Suspends microphone input without destroying the audio context
     */
    async suspendMic() {
        if (!this.isRecording || this.isSuspended) return;
        
        try {
            await this.audioContext.suspend();
            this.stream.getTracks().forEach(track => track.enabled = false);
            this.isSuspended = true;
            console.info('Microphone suspended');
        } catch (error) {
            throw new Error('Failed to suspend microphone:' + error);
        }
    }

    /**
     * Resumes microphone input if previously suspended
     */
    async resumeMic() {
        if (!this.isRecording || !this.isSuspended) return;
        
        try {
            await this.audioContext.resume();
            this.stream.getTracks().forEach(track => track.enabled = true);
            this.isSuspended = false;
            console.info('Microphone resumed');
        } catch (error) {
            throw new Error('Failed to resume microphone:' + error);
        }
    }

    /**
     * Toggles microphone state between suspended and active
     */
    async toggleMic() {
        if (this.isSuspended) {
            await this.resumeMic();
        } else {
            await this.suspendMic();
        }
    }
}
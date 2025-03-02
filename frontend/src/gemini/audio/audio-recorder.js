import { Logger } from '../utils/logger.js';
import { ApplicationError, ErrorCodes } from '../utils/error-boundary.js';
import { CONFIG } from '../config/config.js';

/**
 * @class AudioRecorder
 * @description Handles audio recording functionality with configurable sample rate
 * and real-time audio processing through WebAudio API.
 */
export class AudioRecorder {
    /**
     * @constructor
     * @param {number} sampleRate - The sample rate for audio recording (default: 16000)
     */
    constructor(sampleRate = CONFIG.AUDIO.SAMPLE_RATE) {
        this.sampleRate = sampleRate;
        this.stream = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.source = null;
        this.processor = null;
        this.onAudioData = null;
        
        // Bind methods to preserve context
        this.start = this.start.bind(this);
        this.stop = this.stop.bind(this);

        // Add state tracking
        this.isRecording = false;
    }

    // In your audio-recorder.js file
async initializeAudioWorklet() {
    // Create a blob with the audio worklet processor code
    const workletProcessorBlob = new Blob([`
      // Audio worklet processor code goes here
        /**
         * @class AudioProcessingWorklet
         * @extends AudioWorkletProcessor
         * @description Processes incoming audio data, converting it from Float32 to Int16 format and packaging it into chunks.
         */
        class AudioProcessingWorklet extends AudioWorkletProcessor {
            /**
             * @constructor
             * @description Initializes the buffer for audio processing.
             */
            constructor() {
                super();
                this.buffer = new Int16Array(2048);
                this.bufferWriteIndex = 0;
            }

            /**
             * @method process
             * @description Processes the audio input data.
             * @param {Float32Array[][]} inputs - The input audio data.
             * @returns {boolean} True to keep the worklet alive.
             */
            process(inputs) {
                if (inputs[0].length) {
                    const channel0 = inputs[0][0];
                    this.processChunk(channel0);
                }
                return true;
            }

            /**
             * @method sendAndClearBuffer
             * @description Sends the current buffer content as a message and resets the buffer.
             */
            sendAndClearBuffer() {
                this.port.postMessage({
                    event: 'chunk',
                    data: {
                        int16arrayBuffer: this.buffer.slice(0, this.bufferWriteIndex).buffer,
                    },
                });
                this.bufferWriteIndex = 0;
            }

            /**
             * @method processChunk
             * @description Processes a chunk of audio data, converting it to Int16 format.
             * @param {Float32Array} float32Array - The audio data chunk to process.
             */
            processChunk(float32Array) {
                try {
                    const l = float32Array.length;

                    for (let i = 0; i < l; i++) {
                        const int16Value = Math.max(-32768, Math.min(32767, Math.floor(float32Array[i] * 32768)));
                        this.buffer[this.bufferWriteIndex++] = int16Value;
                        if (this.bufferWriteIndex >= this.buffer.length) {
                            this.sendAndClearBuffer();
                        }
                    }

                    if (this.bufferWriteIndex >= this.buffer.length) {
                        this.sendAndClearBuffer();
                    }
                } catch (error) {
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
     * @method start
     * @description Starts audio recording with the specified callback for audio data.
     * @param {Function} onAudioData - Callback function for processed audio data.
     * @throws {Error} If unable to access microphone or set up audio processing.
     * @async
     */
    async start(onAudioData) {
        this.onAudioData = onAudioData;
        try {
            // Request microphone access
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: this.sampleRate
                } 
            });
            
            this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
            this.source = this.audioContext.createMediaStreamSource(this.stream);

            // Load and initialize audio worklet
            await this.initializeAudioWorklet();
            // await this.audioContext.audioWorklet.addModule('./worklets/audio-processing.js');
            this.processor = new AudioWorkletNode(this.audioContext, 'audio-recorder-worklet');
            
            // Handle processed audio data
            this.processor.port.onmessage = (event) => {
                if (event.data.event === 'chunk' && this.onAudioData && this.isRecording) {
                    const base64Data = this.arrayBufferToBase64(event.data.data.int16arrayBuffer);
                    this.onAudioData(base64Data);
                }
            };

            // Connect audio nodes
            this.source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            this.isRecording = true;
        } catch (error) {
            console.error('Error starting audio recording:', error);
            throw error;
        }
    }

    /**
     * @method stop
     * @description Stops the current recording session and cleans up resources.
     * @throws {ApplicationError} If an error occurs during stopping the recording.
     */
    stop() {
        try {
            if (!this.isRecording) {
                Logger.warn('Attempting to stop recording when not recording');
                return;
            }

            // Stop the microphone stream
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }

            this.isRecording = false;
            Logger.info('Audio recording stopped successfully');
        } catch (error) {
            Logger.error('Error stopping audio recording', error);
            throw new ApplicationError(
                'Failed to stop audio recording',
                ErrorCodes.AUDIO_STOP_FAILED,
                { originalError: error }
            );
        }
    }

    /**
     * @method arrayBufferToBase64
     * @description Converts ArrayBuffer to Base64 string.
     * @param {ArrayBuffer} buffer - The ArrayBuffer to convert.
     * @returns {string} The Base64 representation of the ArrayBuffer.
     * @throws {ApplicationError} If an error occurs during conversion.
     * @private
     */
    arrayBufferToBase64(buffer) {
        try {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        } catch (error) {
            Logger.error('Error converting buffer to base64', error);
            throw new ApplicationError(
                'Failed to convert audio data',
                ErrorCodes.AUDIO_CONVERSION_FAILED,
                { originalError: error }
            );
        }
    }

    /**
     * @method checkBrowserSupport
     * @description Checks if the browser supports required audio APIs.
     * @throws {ApplicationError} If the browser does not support audio recording.
     * @private
     */
    checkBrowserSupport() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new ApplicationError(
                'Audio recording is not supported in this browser',
                ErrorCodes.AUDIO_NOT_SUPPORTED
            );
        }
    }
} 
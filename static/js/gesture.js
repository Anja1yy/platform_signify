// Gesture recognition client-side helper functions
class GestureClient {
    constructor() {
        this.isRecording = false;
        this.captureInterval = null;
        this.frameBuffer = [];
        this.lastPrediction = null;
        this.confidenceThreshold = 0.7; // Minimum confidence to accept a prediction
        this.predictionCooldown = false; // To prevent rapid-fire predictions
        this.sequenceLength = 30; // Number of frames to collect for prediction
        this.captureRate = 100; // Capture a frame every 100ms
    }

    // Start capturing frames for gesture recognition
    startCapturing(videoElement, onGestureDetected) {
        if (this.isRecording) return;
        
        this.isRecording = true;
        this.frameBuffer = [];
        
        // Create canvas for frame capture
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Set canvas dimensions to match video
        canvas.width = videoElement.videoWidth || 640;
        canvas.height = videoElement.videoHeight || 480;
        
        this.captureInterval = setInterval(() => {
            if (this.frameBuffer.length >= this.sequenceLength) {
                // Remove oldest frame
                this.frameBuffer.shift();
            }
            
            try {
                // Draw current video frame to canvas
                context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                
                // Get frame as base64 image
                const frameData = canvas.toDataURL('image/jpeg', 0.8);
                
                // Add to buffer
                this.frameBuffer.push(frameData);
                
                // If we have enough frames and not in cooldown, send for prediction
                if (this.frameBuffer.length >= this.sequenceLength && !this.predictionCooldown) {
                    this.sendFramesForPrediction(onGestureDetected);
                }
            } catch (error) {
                console.error('Error capturing frame:', error);
            }
        }, this.captureRate);
    }
    
    // Stop capturing frames
    stopCapturing() {
        this.isRecording = false;
        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
        }
        this.frameBuffer = [];
    }
    
    // Send the current frame buffer for prediction
    sendFramesForPrediction(onGestureDetected) {
        // Set cooldown to prevent rapid predictions
        this.predictionCooldown = true;
        
        // Get the most recent frame
        const recentFrame = this.frameBuffer[this.frameBuffer.length - 1];
        
        // Send to server for prediction
        fetch('/process_gesture', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                frame: recentFrame
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // If confidence is high enough and it's a new gesture
                if (data.confidence > this.confidenceThreshold && 
                    data.gesture !== "Collecting frames..." && 
                    data.gesture !== this.lastPrediction) {
                    
                    this.lastPrediction = data.gesture;
                    
                    // Call the callback with the detected gesture
                    if (onGestureDetected) {
                        onGestureDetected(data.gesture, data.confidence);
                    }
                    
                    // Set a longer cooldown after successful prediction
                    setTimeout(() => {
                        this.predictionCooldown = false;
                        this.lastPrediction = null;  // Reset last prediction after cooldown
                    }, 2000);
                } else {
                    // Short cooldown for low confidence predictions
                    setTimeout(() => {
                        this.predictionCooldown = false;
                    }, 500);
                }
            } else {
                console.error('Prediction error:', data.error);
                this.predictionCooldown = false;
            }
        })
        .catch(error => {
            console.error('Network error during prediction:', error);
            this.predictionCooldown = false;
        });
    }
    
    // Get a debug visualization of the current frame buffer
    getDebugVisualization() {
        if (this.frameBuffer.length === 0) {
            return "No frames captured yet";
        }
        
        return {
            framesCollected: this.frameBuffer.length,
            targetFrames: this.sequenceLength,
            isRecording: this.isRecording,
            lastPrediction: this.lastPrediction
        };
    }
    
    // Clear the frame buffer and reset state
    reset() {
        this.stopCapturing();
        this.lastPrediction = null;
        this.predictionCooldown = false;
    }
}

// Usage in meeting.js:
// const gestureClient = new GestureClient();
// 
// function startGestureRecognition() {
//     const videoElement = document.getElementById(`video-${userId}`);
//     gestureClient.startCapturing(videoElement, (gesture, confidence) => {
//         socket.emit('gesture_message', {
//             meeting_id: meetingId,
//             message: gesture
//         });
//         speakGesture(gesture);
//     });
// }
// 
// function stopGestureRecognition() {
//     gestureClient.stopCapturing();
// }
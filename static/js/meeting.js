// Global variables
const socket = io();
const meetingId = document.getElementById('meeting-id').innerText.split(':')[1].trim();
const userId = document.getElementById('user-id').value;
const username = document.getElementById('username').value;
let localStream = null;
let isGestureActive = false;
let isMicActive = true;
let isCameraActive = true;
let peerConnections = {}; // Store RTCPeerConnection objects

// DOM elements
const videoGrid = document.getElementById('video-grid');
const chatMessages = document.getElementById('chat-messages');
const chatInputField = document.getElementById('chat-input-field');
const micToggle = document.getElementById('mic-toggle');
const cameraToggle = document.getElementById('camera-toggle');
const gestureToggle = document.getElementById('gesture-toggle');
const participantsList = document.getElementById('participants-list');

// ICE servers for WebRTC (STUN/TURN)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeMeeting();
    
    // Set up chat input
    chatInputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
});

// Initialize the meeting
async function initializeMeeting() {
    try {
        // Get media stream
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        
        // Create local video
        const localVideo = createVideoElement(userId, username, true);
        videoGrid.appendChild(localVideo);
        localVideo.srcObject = localStream;
        
        // Join the meeting
        socket.emit('join', { meeting_id: meetingId });
        
        // Set up socket event listeners
        setupSocketListeners();
        
        // Initialize gesture recognition if needed
        if (isGestureActive) {
            startGestureRecognition();
        }
    } catch (err) {
        console.error('Error accessing media devices:', err);
        addSystemMessage('Error: Could not access camera or microphone. Please check permissions.');
    }
}

// Set up socket event listeners
function setupSocketListeners() {
    // When a new user joins
    socket.on('user_joined', (data) => {
        addSystemMessage(`${data.username} joined the meeting`);
        
        // Create a new peer connection for the new user
        if (data.user_id !== userId) {
            createPeerConnection(data.user_id, false);
            
            // Send an offer to the new user
            createOffer(data.user_id);
        }
        
        // Update participants list
        updateParticipantsList(data.participants);
    });
    
    // When a user leaves
    socket.on('user_left', (data) => {
        addSystemMessage(`${data.username} left the meeting`);
        
        // Remove their video
        const userVideo = document.getElementById(`video-${data.user_id}`);
        if (userVideo) {
            userVideo.parentElement.remove();
        }
        
        // Close and remove the peer connection
        if (peerConnections[data.user_id]) {
            peerConnections[data.user_id].close();
            delete peerConnections[data.user_id];
        }
    });
    
    // When a new message is received
    socket.on('new_message', (data) => {
        addChatMessage(data.username, data.message, data.type);
        
        // If it's a gesture message, also convert to speech
        if (data.type === 'gesture') {
            speakText(data.message);
        }
    });
    
    // WebRTC Signaling
    socket.on('offer', async (data) => {
        const { offer, user_id, username } = data;
        
        // Create peer connection if it doesn't exist
        if (!peerConnections[user_id]) {
            createPeerConnection(user_id, true);
        }
        
        try {
            await peerConnections[user_id].setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnections[user_id].createAnswer();
            await peerConnections[user_id].setLocalDescription(answer);
            
            // Send the answer back
            socket.emit('answer', {
                meeting_id: meetingId,
                to_user_id: user_id,
                answer: answer
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    });
    
    socket.on('answer', async (data) => {
        const { answer, user_id } = data;
        try {
            if (peerConnections[user_id]) {
                await peerConnections[user_id].setRemoteDescription(new RTCSessionDescription(answer));
            }
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    });
    
    socket.on('ice_candidate', async (data) => {
        const { candidate, user_id } = data;
        try {
            if (peerConnections[user_id]) {
                await peerConnections[user_id].addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('Error adding ice candidate:', error);
        }
    });
}

// Create a peer connection for a user
function createPeerConnection(userId, isReceiver) {
    const peerConnection = new RTCPeerConnection(iceServers);
    peerConnections[userId] = peerConnection;
    
    // Add local tracks to the peer connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
    
    // Set up ice candidate event
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice_candidate', {
                meeting_id: meetingId,
                to_user_id: userId,
                candidate: event.candidate
            });
        }
    };
    
    // Set up track event to get remote stream
    peerConnection.ontrack = (event) => {
        // Create a video element for the remote user if it doesn't exist
        let videoElement = document.getElementById(`video-${userId}`);
        if (!videoElement) {
            videoElement = createVideoElement(userId, `Participant ${userId}`, false);
            videoGrid.appendChild(videoElement);
            
            // Update the name when we get user info
            socket.emit('get_user_info', {
                meeting_id: meetingId,
                user_id: userId
            });
        }
        
        // Set the remote stream as the source for the video element
        if (videoElement && event.streams && event.streams[0]) {
            videoElement.srcObject = event.streams[0];
        }
    };
    
    // For debugging connection state
    peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state with ${userId}: ${peerConnection.connectionState}`);
    };
    
    // For debugging ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state with ${userId}: ${peerConnection.iceConnectionState}`);
    };
    
    return peerConnection;
}

// Create an offer to establish a WebRTC connection
async function createOffer(toUserId) {
    try {
        const peerConnection = peerConnections[toUserId];
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Send the offer to the other user
        socket.emit('offer', {
            meeting_id: meetingId,
            to_user_id: toUserId,
            offer: offer
        });
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

// Create a video element for a user
function createVideoElement(userId, username, isLocal = false) {
    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `container-${userId}`;
    
    const video = document.createElement('video');
    video.id = `video-${userId}`;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = isLocal; // Mute local video to prevent feedback
    
    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.textContent = username + (isLocal ? ' (You)' : '');
    
    videoContainer.appendChild(video);
    videoContainer.appendChild(nameTag);
    
    return video;
}

// Toggle microphone
function toggleMic() {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            isMicActive = !isMicActive;
            audioTracks[0].enabled = isMicActive;
            
            // Update UI
            micToggle.classList.toggle('active', isMicActive);
            micToggle.classList.toggle('inactive', !isMicActive);
            
            // Update icon
            const icon = micToggle.querySelector('.icon');
            icon.textContent = isMicActive ? '🎤' : '🔇';
        }
    }
}

// Toggle camera
function toggleCamera() {
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length > 0) {
            isCameraActive = !isCameraActive;
            videoTracks[0].enabled = isCameraActive;
            
            // Update UI
            cameraToggle.classList.toggle('active', isCameraActive);
            cameraToggle.classList.toggle('inactive', !isCameraActive);
            
            // Update icon
            const icon = cameraToggle.querySelector('.icon');
            icon.textContent = isCameraActive ? '📹' : '🚫';
        }
    }
}

// Toggle gesture recognition
function toggleGesture() {
    isGestureActive = !isGestureActive;
    
    // Update UI
    gestureToggle.classList.toggle('active', isGestureActive);
    gestureToggle.classList.toggle('inactive', !isGestureActive);
    
    // Start or stop gesture recognition
    if (isGestureActive) {
        startGestureRecognition();
        addSystemMessage('Gesture recognition activated');
    } else {
        stopGestureRecognition();
        addSystemMessage('Gesture recognition deactivated');
    }
}

// Start gesture recognition
let gestureInterval = null;
function startGestureRecognition() {
    if (!localStream) return;
    
    // Create a canvas to capture frames from video
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const video = document.getElementById(`video-${userId}`);
    
    canvas.width = 320;
    canvas.height = 240;
    
    // Capture frames at regular intervals
    gestureInterval = setInterval(() => {
        if (!isGestureActive) {
            clearInterval(gestureInterval);
            return;
        }
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = canvas.toDataURL('image/jpeg');
        
        // Send frame to server for processing
        fetch('/process_gesture', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                frame: frameData,
                meeting_id: meetingId
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.gesture && data.gesture !== "Collecting frames..." && data.confidence > 0.7) {
                // Send recognized gesture as message
                socket.emit('gesture_message', {
                    meeting_id: meetingId,
                    message: data.gesture
                });
            }
        })
        .catch(error => {
            console.error('Error processing gesture:', error);
        });
    }, 1000); // Process every second
}

// Stop gesture recognition
function stopGestureRecognition() {
    if (gestureInterval) {
        clearInterval(gestureInterval);
        gestureInterval = null;
    }
}

// Send a chat message
function sendChatMessage() {
    const message = chatInputField.value.trim();
    if (message) {
        socket.emit('chat_message', {
            meeting_id: meetingId,
            message: message
        });
        
        chatInputField.value = '';
    }
}

// Add a chat message to the chat box
function addChatMessage(sender, message, type = 'chat') {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}-message`;
    
    const senderElement = document.createElement('div');
    senderElement.className = 'message-sender';
    senderElement.textContent = sender;
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.textContent = message;
    
    messageElement.appendChild(senderElement);
    messageElement.appendChild(contentElement);
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add a system message to the chat box
function addSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    
    const contentElement = document.createElement('p');
    contentElement.textContent = message;
    
    messageElement.appendChild(contentElement);
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Speak text using text-to-speech
function speakText(text) {
    if ('speechSynthesis' in window) {
        const speech = new SpeechSynthesisUtterance(text);
        speech.lang = 'en-US';
        window.speechSynthesis.speak(speech);
    }
}

// Copy meeting ID to clipboard
function copyMeetingId() {
    const meetingId = document.getElementById('meeting-id').innerText.split(':')[1].trim();
    navigator.clipboard.writeText(meetingId)
        .then(() => {
            alert('Meeting ID copied to clipboard');
        })
        .catch(err => {
            console.error('Could not copy text:', err);
        });
}

// Leave the meeting
function leaveMeeting() {
    // Notify others that you're leaving
    socket.emit('leave', { meeting_id: meetingId });
    
    // Close all peer connections
    Object.keys(peerConnections).forEach(userId => {
        peerConnections[userId].close();
    });
    peerConnections = {};
    
    // Stop all media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    
    // Stop gesture recognition if active
    if (isGestureActive) {
        stopGestureRecognition();
    }
    
    // Redirect to thank you page
    window.location.href = `/thankyou?meeting_id=${meetingId}`;
}

// Update the list of participants
function updateParticipantsList(participants) {
    if (!participantsList) return;
    
    // Clear the current list
    participantsList.innerHTML = '';
    
    // Add each participant to the list
    participants.forEach(participant => {
        const participantElement = document.createElement('div');
        participantElement.className = 'participant';
        participantElement.dataset.userId = participant.id;
        
        const avatarElement = document.createElement('div');
        avatarElement.className = 'avatar';
        avatarElement.textContent = participant.name.charAt(0).toUpperCase();
        
        const nameElement = document.createElement('div');
        nameElement.className = 'name';
        nameElement.textContent = participant.name + (participant.id === userId ? ' (You)' : '');
        
        participantElement.appendChild(avatarElement);
        participantElement.appendChild(nameElement);
        
        participantsList.appendChild(participantElement);
    });
}

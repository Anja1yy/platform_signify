from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
import sqlite3
import uuid
import json
from database import init_db, add_user, verify_user, get_user, add_meeting, get_meeting, meeting_exists
from gesture_recognition import GestureRecognizer

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)
socketio = SocketIO(app, 
                   cors_allowed_origins="*",
                   ping_timeout=60,
                   ping_interval=25,
                   async_mode='eventlet')

# Initialize database
init_db()

# Initialize gesture recognizer
gesture_recognizer = GestureRecognizer()

# Active participants (stored in memory but keyed by meeting ID)
active_participants = {}

# STUN/TURN servers configuration for WebRTC
ICE_SERVERS = {
    'iceServers': [
        {'urls': 'stun:stun.l.google.com:19302'},
        {'urls': 'stun:stun1.l.google.com:19302'},
        {'urls': 'stun:stun2.l.google.com:19302'},
    ]
}

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        
        if verify_user(email, password):
            user = get_user(email)
            session['user_id'] = user['id']
            session['user_name'] = user['name']
            session['user_email'] = user['email']
            return redirect(url_for('dashboard'))
        else:
            return render_template('login.html', error="Invalid credentials")
    
    return render_template('login.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        name = request.form.get('name')
        email = request.form.get('email')
        password = request.form.get('password')
        
        user_added = add_user(name, email, password)
        if user_added:
            return redirect(url_for('login'))
        else:
            return render_template('login.html', error="Email already exists")
    
    return render_template('login.html', signup=True)

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    return render_template('dashboard.html', username=session['user_name'])

@app.route('/create_meeting')
def create_meeting():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    meeting_id = str(uuid.uuid4())[:8]
    # Store meeting in database
    add_meeting(meeting_id, session['user_id'])
    
    # Initialize participant tracking for this meeting
    if meeting_id not in active_participants:
        active_participants[meeting_id] = {}
    
    return redirect(url_for('meeting', meeting_id=meeting_id))

@app.route('/join_meeting', methods=['POST'])
def join_meeting():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    meeting_id = request.form.get('meeting_id')
    
    # Check if meeting exists in database
    if meeting_exists(meeting_id):
        return redirect(url_for('meeting', meeting_id=meeting_id))
    else:
        return render_template('dashboard.html', error="Meeting not found", username=session['user_name'])

@app.route('/meeting/<meeting_id>')
def meeting(meeting_id):
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    # Check if meeting exists in database
    if not meeting_exists(meeting_id):
        # Create meeting if it doesn't exist (for the host)
        add_meeting(meeting_id, session['user_id'])
    
    # Initialize participant tracking for this meeting if not already done
    if meeting_id not in active_participants:
        active_participants[meeting_id] = {}
    
    return render_template('meeting.html', 
                         meeting_id=meeting_id, 
                         username=session['user_name'], 
                         user_id=session['user_id'],
                         ice_servers=ICE_SERVERS)

@app.route('/thankyou')
def thankyou():
    meeting_id = request.args.get('meeting_id', '')
    return render_template('thankyou.html', meeting_id=meeting_id)

@app.route('/process_gesture', methods=['POST'])
def process_gesture():
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not authenticated'})
    
    try:
        # Get the frame data from the request
        frame_data = request.json.get('frame')
        meeting_id = request.json.get('meeting_id')
        
        # Process the frame with the gesture recognizer
        gesture, confidence = gesture_recognizer.predict(frame_data)
        
        # Return the result
        return jsonify({
            'success': True,
            'gesture': gesture,
            'confidence': confidence
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

# WebSocket event handlers
@socketio.on('join')
def on_join(data):
    meeting_id = data['meeting_id']
    user_id = session.get('user_id')
    username = session.get('user_name')
    
    if not user_id or not username:
        return
    
    print(f"User {username} ({user_id}) joining meeting {meeting_id}")
    join_room(meeting_id)
    join_room(user_id)  # Join a room specific to this user for direct messages
    
    # Add participant to meeting's active participants
    if meeting_id not in active_participants:
        active_participants[meeting_id] = {}
    
    active_participants[meeting_id][user_id] = {
        'name': username,
        'id': user_id,
        'connected': True
    }
    
    # Notify ALL participants including the new user
    emit('user_joined', {
        'user_id': user_id,
        'username': username,
        'participants': list(active_participants[meeting_id].values())
    }, room=meeting_id, broadcast=True)
    
    # Send current participants list to the new user
    emit('initialize_participants', {
        'participants': list(active_participants[meeting_id].values()),
        'ice_servers': ICE_SERVERS
    }, room=user_id)

@socketio.on('disconnect')
def handle_disconnect():
    for meeting_id in active_participants:
        user_id = session.get('user_id')
        if user_id in active_participants[meeting_id]:
            username = active_participants[meeting_id][user_id]['name']
            del active_participants[meeting_id][user_id]
            emit('user_left', {
                'user_id': user_id,
                'username': username
            }, room=meeting_id, broadcast=True)

@socketio.on('offer')
def handle_offer(data):
    meeting_id = data['meeting_id']
    to_user_id = data['to_user_id']
    offer = data['offer']
    user_id = session.get('user_id')
    
    if not user_id or user_id not in active_participants.get(meeting_id, {}):
        return
    
    username = active_participants[meeting_id][user_id]['name']
    print(f"Forwarding offer from {username} ({user_id}) to {to_user_id}")
    
    emit('offer', {
        'offer': offer,
        'user_id': user_id,
        'username': username
    }, room=to_user_id)

@socketio.on('answer')
def handle_answer(data):
    meeting_id = data['meeting_id']
    to_user_id = data['to_user_id']
    answer = data['answer']
    user_id = session.get('user_id')
    
    if not user_id or user_id not in active_participants.get(meeting_id, {}):
        return
    
    print(f"Forwarding answer from {user_id} to {to_user_id}")
    emit('answer', {
        'answer': answer,
        'user_id': user_id
    }, room=to_user_id)

@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    meeting_id = data['meeting_id']
    to_user_id = data['to_user_id']
    candidate = data['candidate']
    user_id = session.get('user_id')
    
    if not user_id or user_id not in active_participants.get(meeting_id, {}):
        return
    
    print(f"Forwarding ICE candidate from {user_id} to {to_user_id}")
    emit('ice_candidate', {
        'candidate': candidate,
        'user_id': user_id
    }, room=to_user_id)

@socketio.on('chat_message')
def handle_chat_message(data):
    meeting_id = data['meeting_id']
    user_id = session.get('user_id')
    
    if not user_id or user_id not in active_participants.get(meeting_id, {}):
        return
    
    username = active_participants[meeting_id][user_id]['name']
    message = data['message']
    
    print(f"Chat message from {username} in meeting {meeting_id}: {message}")
    emit('new_message', {
        'user_id': user_id,
        'username': username,
        'message': message,
        'type': 'chat'
    }, room=meeting_id, broadcast=True)

@socketio.on('video_stream')
def handle_video_stream(data):
    meeting_id = data['meeting_id']
    user_id = session.get('user_id')
    stream_data = data['stream']
    
    if not user_id:
        return
    
    # Broadcast the video stream to all participants in the meeting except the sender
    emit('video_stream', {
        'user_id': user_id,
        'stream': stream_data
    }, to=meeting_id, skip_sid=request.sid)

@socketio.on('get_user_info')
def handle_get_user_info(data):
    meeting_id = data['meeting_id']
    requested_user_id = data['user_id']
    
    # Get the user information from the database or active participants
    user_info = None
    if meeting_id in active_participants and requested_user_id in active_participants[meeting_id]:
        user_info = active_participants[meeting_id][requested_user_id]
    
    if user_info:
        emit('user_info', {
            'user_id': requested_user_id,
            'username': user_info['name']
        })

if __name__ == '__main__':
    socketio.run(app, debug=True)

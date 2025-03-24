import sqlite3
import hashlib
import os

DB_PATH = 'signify.db'

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
    ''')
    
    # Create meetings table
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        host_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (host_id) REFERENCES users (id)
    )
    ''')
    
    conn.commit()
    conn.close()

def hash_password(password):
    # Simple password hashing
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return salt.hex() + ':' + key.hex()

def verify_password(stored_password, provided_password):
    salt_hex, key_hex = stored_password.split(':')
    salt = bytes.fromhex(salt_hex)
    stored_key = bytes.fromhex(key_hex)
    new_key = hashlib.pbkdf2_hmac('sha256', provided_password.encode('utf-8'), salt, 100000)
    return new_key == stored_key

def add_user(name, email, password):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if user already exists
    cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
    if cursor.fetchone() is not None:
        conn.close()
        return False
    
    hashed_password = hash_password(password)
    
    # Add user to database
    cursor.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
                  (name, email, hashed_password))
    
    conn.commit()
    conn.close()
    return True

def verify_user(email, password):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
    user = cursor.fetchone()
    
    if user is None:
        conn.close()
        return False
    
    stored_password = user['password']
    conn.close()
    
    return verify_password(stored_password, password)

def get_user(email):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT id, name, email FROM users WHERE email = ?', (email,))
    user = cursor.fetchone()
    
    conn.close()
    return dict(user) if user else None

def add_meeting(meeting_id, host_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if meeting already exists
    cursor.execute('SELECT * FROM meetings WHERE id = ?', (meeting_id,))
    if cursor.fetchone() is not None:
        conn.close()
        return False
    
    cursor.execute('INSERT INTO meetings (id, host_id) VALUES (?, ?)',
                  (meeting_id, host_id))
    
    conn.commit()
    conn.close()
    return True

def get_meeting(meeting_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT * FROM meetings WHERE id = ?', (meeting_id,))
    meeting = cursor.fetchone()
    
    conn.close()
    return dict(meeting) if meeting else None

def meeting_exists(meeting_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT COUNT(*) as count FROM meetings WHERE id = ?', (meeting_id,))
    result = cursor.fetchone()
    
    conn.close()
    return result['count'] > 0

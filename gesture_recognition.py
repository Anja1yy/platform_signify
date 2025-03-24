import tensorflow as tf
import numpy as np
import pickle
import cv2
import base64
import json
import os
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.layers import InputLayer, Masking
from tensorflow.keras.mixed_precision import Policy

class CustomInputLayer(InputLayer):
    def __init__(self, **kwargs):
        if 'batch_shape' in kwargs:
            kwargs['input_shape'] = kwargs.pop('batch_shape')[1:]
        super().__init__(**kwargs)

class GestureRecognizer:
    def __init__(self, model_path='models/signify_model_optimized_01.h5', label_path='models/signify_label_encoder_optimized_01.pkl'):
        try:
            # Register DTypePolicy
            tf.keras.utils.register_keras_serializable(package='keras')(Policy)
            
            # Load model with custom objects
            self.model = tf.keras.models.load_model(
                model_path,
                custom_objects={
                    'InputLayer': CustomInputLayer,
                    'DTypePolicy': Policy,
                    'Masking': Masking
                },
                compile=False
            )
            self.model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
            
            # Define the possible sentences
            self.sentences = [
                "we all are with you",
                "you are welcome",
                "where are you from",
                "i really appreciate it"
            ]
            
            # Load label encoder
            with open(label_path, 'rb') as f:
                self.label_encoder = pickle.load(f)
            
            # Define sequence length and image dimensions
            self.sequence_length = 30  # Adjust based on your model's input requirements
            self.img_size = (64, 64)  # Adjust based on your model's input requirements
            
            # Buffer for storing frames to create sequences
            self.frames_buffer = []
            
            print("Model loaded successfully with sentences:", self.sentences)
        except Exception as e:
            print(f"Exception encountered in init: {str(e)}")
            raise e
    
    def preprocess_frame(self, frame_data):
        """Convert base64 encoded frame to numpy array and preprocess it"""
        try:
            # Decode base64 string to image
            img_bytes = base64.b64decode(frame_data.split(',')[1])
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            
            # Preprocess frame (resize, normalize, etc.)
            frame = cv2.resize(frame, self.img_size)
            frame = frame / 255.0  # Normalize
            
            return frame
        except Exception as e:
            print(f"Error in preprocessing frame: {str(e)}")
            return None
    
    def predict(self, frame_data):
        """Process frame and make prediction if enough frames are collected"""
        try:
            # Preprocess frame
            frame = self.preprocess_frame(frame_data)
            if frame is None:
                print("Error: Frame preprocessing failed")
                return "Error processing frame", 0.0
            
            # Add frame to buffer
            self.frames_buffer.append(frame)
            
            # Keep only the latest frames
            if len(self.frames_buffer) > self.sequence_length:
                self.frames_buffer.pop(0)
            
            # If we don't have enough frames yet, return no prediction
            if len(self.frames_buffer) < self.sequence_length:
                print(f"Collecting frames... {len(self.frames_buffer)}/{self.sequence_length}")
                return "Collecting frames...", 0.0
            
            # Create sequence
            sequence = np.array(self.frames_buffer)
            sequence = np.expand_dims(sequence, axis=0)  # Add batch dimension
            
            print("Input sequence shape:", sequence.shape)
            
            # Make prediction
            prediction = self.model.predict(sequence, verbose=0)[0]
            
            # Get the predicted class and confidence
            predicted_class_idx = np.argmax(prediction)
            confidence = float(prediction[predicted_class_idx])
            
            print(f"Predicted class index: {predicted_class_idx}")
            print(f"Raw confidence: {confidence}")
            print(f"All probabilities: {prediction}")
            
            # Get the sentence directly from our list
            if 0 <= predicted_class_idx < len(self.sentences):
                predicted_sentence = self.sentences[predicted_class_idx]
                print(f"Predicted sentence: {predicted_sentence}")
                return predicted_sentence, confidence
            else:
                print(f"Invalid class index: {predicted_class_idx}")
                return "Error", 0.0
            
        except Exception as e:
            print(f"Error in prediction: {str(e)}")
            import traceback
            traceback.print_exc()
            return "Error", 0.0
    
    def clear_buffer(self):
        """Clear the frames buffer"""
        self.frames_buffer = []
    
    def recognize_gesture(self, frame_data):
        """Recognize gesture from frame data"""
        try:
            # Process the frame and get prediction
            gesture, confidence = self.predict(frame_data)
            
            print(f"Gesture: {gesture}, Confidence: {confidence}")  # Debug print
            
            # If confidence is too low or still collecting frames, return None
            if gesture == "Collecting frames..." or gesture == "Error":
                return None
            
            if confidence < 0.5:  # 50% confidence threshold
                print("Confidence too low")  # Debug print
                return None
            
            # Clear buffer after successful recognition
            self.clear_buffer()
            return gesture
            
        except Exception as e:
            print(f"Error in gesture recognition: {str(e)}")
            import traceback
            traceback.print_exc()
            return None
document.addEventListener('DOMContentLoaded', function() {
    const createMeetingBtn = document.getElementById('create-meeting-btn');
    const joinMeetingForm = document.getElementById('join-meeting-form');
    const joinMessage = document.getElementById('join-message');
    
    // Create a new meeting
    createMeetingBtn.addEventListener('click', function() {
        createMeetingBtn.disabled = true;
        createMeetingBtn.textContent = 'Creating...';
        
        fetch('/create-meeting', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = `/meeting/${data.meeting_id}`;
            } else {
                alert('Error creating meeting: ' + data.message);
                createMeetingBtn.disabled = false;
                createMeetingBtn.textContent = 'New Meeting';
            }
        })
        .catch(error => {
            alert('An error occurred. Please try again.');
            createMeetingBtn.disabled = false;
            createMeetingBtn.textContent = 'New Meeting';
        });
    });
    
    // Join an existing meeting
    joinMeetingForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const meetingCode = document.getElementById('meeting-code').value.trim();
        
        if (!meetingCode) {
            joinMessage.textContent = 'Please enter a meeting code';
            joinMessage.classList.add('error');
            return;
        }
        
        const submitBtn = joinMeetingForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Joining...';
        
        fetch('/join-meeting', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'meeting_id': meetingCode
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = data.redirect;
            } else {
                joinMessage.textContent = data.message;
                joinMessage.classList.add('error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Join Meeting';
            }
        })
        .catch(error => {
            joinMessage.textContent = 'An error occurred. Please try again.';
            joinMessage.classList.add('error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Join Meeting';
        });
    });
});
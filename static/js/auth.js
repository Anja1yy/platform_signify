document.addEventListener('DOMContentLoaded', function() {
    // Form tab switching
    const loginTab = document.getElementById('login-tab');
    const signupTab = document.getElementById('signup-tab');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    
    loginTab.addEventListener('click', function() {
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        loginForm.classList.add('active');
        signupForm.classList.remove('active');
    });
    
    signupTab.addEventListener('click', function() {
        signupTab.classList.add('active');
        loginTab.classList.remove('active');
        signupForm.classList.add('active');
        loginForm.classList.remove('active');
    });
    
    // Login form submission
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const messageBox = document.getElementById('login-message');
        
        // Simple validation
        if (!email || !password) {
            messageBox.textContent = 'Please fill in all fields';
            messageBox.classList.add('error');
            return;
        }
        
        // Submit the login request
        fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'email': email,
                'password': password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = data.redirect;
            } else {
                messageBox.textContent = data.message;
                messageBox.classList.add('error');
            }
        })
        .catch(error => {
            messageBox.textContent = 'An error occurred. Please try again.';
            messageBox.classList.add('error');
        });
    });
    
    // Signup form submission
    signupForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const username = document.getElementById('signup-username').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;
        const messageBox = document.getElementById('signup-message');
        
        // Simple validation
        if (!username || !email || !password || !confirm) {
            messageBox.textContent = 'Please fill in all fields';
            messageBox.classList.add('error');
            return;
        }
        
        if (password !== confirm) {
            messageBox.textContent = 'Passwords do not match';
            messageBox.classList.add('error');
            return;
        }
        
        // Submit the signup request
        fetch('/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'username': username,
                'email': email,
                'password': password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = data.redirect;
            } else {
                messageBox.textContent = data.message;
                messageBox.classList.add('error');
            }
        })
        .catch(error => {
            messageBox.textContent = 'An error occurred. Please try again.';
            messageBox.classList.add('error');
        });
    });
});
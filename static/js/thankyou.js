document.addEventListener('DOMContentLoaded', function() {
    const ratingStars = document.querySelectorAll('.rating-star');
    const feedbackText = document.getElementById('feedback-text');
    const submitFeedbackBtn = document.getElementById('submit-feedback');
    let selectedRating = 0;
    
    // Handle star rating selection
    ratingStars.forEach(star => {
        star.addEventListener('mouseenter', function() {
            const rating = parseInt(this.getAttribute('data-rating'));
            highlightStars(rating);
        });
        
        star.addEventListener('mouseleave', function() {
            highlightStars(selectedRating);
        });
        
        star.addEventListener('click', function() {
            selectedRating = parseInt(this.getAttribute('data-rating'));
            highlightStars(selectedRating);
        });
    });
    
    // Highlight stars up to a given rating
    function highlightStars(rating) {
        ratingStars.forEach(star => {
            const starRating = parseInt(star.getAttribute('data-rating'));
            if (starRating <= rating) {
                star.classList.add('active');
            } else {
                star.classList.remove('active');
            }
        });
    }
    
    // Handle feedback submission
    submitFeedbackBtn.addEventListener('click', function() {
        if (selectedRating === 0) {
            alert('Please select a rating before submitting.');
            return;
        }
        
        const feedback = {
            rating: selectedRating,
            comments: feedbackText.value.trim()
        };
        
        // In a real application, send this feedback to your server
        console.log('Feedback submitted:', feedback);
        
        // Show confirmation
        alert('Thank you for your feedback!');
        
        // Reset the form
        selectedRating = 0;
        highlightStars(0);
        feedbackText.value = '';
    });
});
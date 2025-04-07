// File: app.js
// Last Updated: 2025-04-07 (with Wake Lock API integration)

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const body = document.body;
    const homePage = document.getElementById('home');
    const exercisePage = document.getElementById('exercise');
    const durationSlider = document.getElementById('phase-duration-slider');
    const durationValueDisplay = document.getElementById('duration-value');
    const presetButtons = document.querySelectorAll('.preset-buttons button');
    const startNoLimitButton = document.getElementById('start-no-limit');
    const stopButton = document.getElementById('stop-button');
    const totalTimeDisplay = document.getElementById('total-time-display');
    const animationContainer = document.getElementById('animation-container');
    const boxOutline = document.getElementById('box-outline');
    const dot = document.getElementById('dot');
    const phaseNameDisplay = document.getElementById('phase-name');
    const phaseTimerDisplay = document.getElementById('phase-timer');

    // --- State Variables ---
    let phaseDuration = 4; // Default duration in seconds
    let timeLimitSeconds = null; // null means no limit
    let currentPhaseIndex = 0;
    const phases = ['inhale', 'hold', 'exhale', 'wait'];
    let phaseTimerInterval = null;
    let totalTimerInterval = null;
    let elapsedSeconds = 0;
    let remainingPhaseTime = 0;
    let isRunning = false;
    let boxWidth = 0;
    let boxHeight = 0;
    let screenWakeLockSentinel = null; // Variable for the Screen Wake Lock

    // --- Initial Setup ---
    durationValueDisplay.textContent = phaseDuration; // Initial display
    durationSlider.value = phaseDuration;

    // --- Event Listeners ---
    durationSlider.addEventListener('input', (e) => {
        phaseDuration = parseInt(e.target.value, 10);
        durationValueDisplay.textContent = phaseDuration;
    });

    presetButtons.forEach(button => {
        button.addEventListener('click', () => {
            timeLimitSeconds = parseInt(button.getAttribute('data-duration'), 10);
            startExercise(); // Will call the async version
        });
    });

    startNoLimitButton.addEventListener('click', () => {
        timeLimitSeconds = null;
        startExercise(); // Will call the async version
    });

    stopButton.addEventListener('click', () => {
        stopExercise(); // Will call the async version
    });

    // Listener for visibility changes to handle Wake Lock re-acquisition
    document.addEventListener('visibilitychange', async () => {
        // Check if the page is visible AND the lock is not currently held AND the exercise should be running
        if (document.visibilityState === 'visible' && screenWakeLockSentinel === null && isRunning) {
            console.log("Page became visible, attempting to re-acquire Screen Wake Lock.");
            if ('wakeLock' in navigator) {
                try {
                    screenWakeLockSentinel = await navigator.wakeLock.request('screen');
                    console.log('Screen Wake Lock re-acquired successfully!');
                    // Re-add the release listener
                    screenWakeLockSentinel.addEventListener('release', () => {
                        console.log('Screen Wake Lock was released (after re-acquire).');
                        screenWakeLockSentinel = null;
                    });
                } catch (err) {
                    console.error(`Screen Wake Lock re-acquire failed: ${err.name} - ${err.message}`);
                    screenWakeLockSentinel = null;
                }
            }
        }
    });


    // --- Core Functions ---

    // Updated startExercise to be async and handle Wake Lock request
    async function startExercise() {
        if (isRunning) return;
        console.log(`Starting exercise. Duration: ${phaseDuration}s, Limit: ${timeLimitSeconds ? timeLimitSeconds + 's' : 'None'}`);

        // --- Request Screen Wake Lock ---
        if ('wakeLock' in navigator) {
            try {
                // Request a screen wake lock
                screenWakeLockSentinel = await navigator.wakeLock.request('screen');
                console.log('Screen Wake Lock acquired successfully!');

                // Add listener for when it's released unexpectedly (e.g., tab hidden)
                screenWakeLockSentinel.addEventListener('release', () => {
                    console.log('Screen Wake Lock was released automatically.');
                    // Sentinel is automatically invalidated, set our variable to null
                    screenWakeLockSentinel = null;
                });

            } catch (err) {
                // Handle errors, e.g., user denied permission, browser restriction
                console.error(`Screen Wake Lock request failed: ${err.name} - ${err.message}`);
                screenWakeLockSentinel = null; // Ensure it's null if request fails
            }
        } else {
            console.log('Wake Lock API not supported on this browser/device.');
        }
        // --- End Wake Lock Request ---

        isRunning = true; // Set running state
        elapsedSeconds = 0;
        currentPhaseIndex = 0; // Start from inhale

        // Calculate box dimensions for animation once
        boxWidth = boxOutline.clientWidth;
        boxHeight = boxOutline.clientHeight;

        // Reset displays
        updateTotalTimeDisplay();
        phaseNameDisplay.textContent = "Get Ready...";
        phaseTimerDisplay.textContent = "";
        resetDotPosition(); // Put dot back to start before animation

        // Switch pages
        body.classList.add('exercise-active');

        // Start timers after a short delay to allow page transition
        setTimeout(() => {
            totalTimerInterval = setInterval(updateTotalTime, 1000);
            nextPhase(); // Start the first phase
        }, 500); // Delay matches CSS transition roughly
    }

    // Updated stopExercise to be async and handle Wake Lock release
    async function stopExercise() {
        console.log("Stopping exercise.");
        isRunning = false; // Set isRunning false first
        clearInterval(phaseTimerInterval);
        clearInterval(totalTimerInterval);
        phaseTimerInterval = null;
        totalTimerInterval = null;

        // --- Release Screen Wake Lock ---
        if (screenWakeLockSentinel !== null) {
            try {
                await screenWakeLockSentinel.release();
                console.log('Screen Wake Lock released manually.');
                screenWakeLockSentinel = null; // Clear the reference
            } catch (err) {
                console.error(`Screen Wake Lock release failed: ${err.name} - ${err.message}`);
                // Sentinel might already be invalid, ensure it's null
                screenWakeLockSentinel = null;
            }
        }
        // --- End Wake Lock Release ---

        // Reset displays
        phaseNameDisplay.textContent = 'Stopped';
        phaseTimerDisplay.textContent = '';
        resetDotPosition();

        // Switch back to home page
        body.classList.remove('exercise-active');
    }

    function nextPhase() {
        clearInterval(phaseTimerInterval); // Clear previous phase timer

        // Get current phase details
        const currentPhase = phases[currentPhaseIndex % phases.length];
        remainingPhaseTime = phaseDuration;

        // Update displays
        phaseNameDisplay.textContent = currentPhase;
        updatePhaseTimerDisplay();

        // Animate the dot for the current phase
        animateDot(currentPhase, phaseDuration);

        // Start the countdown for the current phase
        phaseTimerInterval = setInterval(updatePhaseTimer, 1000);

        // Move to the next phase index for the *next* call
        currentPhaseIndex++;
    }

    function updatePhaseTimer() {
        remainingPhaseTime--;
        updatePhaseTimerDisplay();

        if (remainingPhaseTime <= 0) {
            // Check for time limit condition BEFORE starting the next phase
            const currentPhaseName = phases[(currentPhaseIndex - 1) % phases.length]; // Phase that just ended
            const limitReached = timeLimitSeconds !== null && elapsedSeconds >= timeLimitSeconds;

            // --- End on Exhale Logic ---
            // If limit is reached AND the phase that just finished was 'exhale', stop.
            if (limitReached && currentPhaseName === 'exhale') {
                 console.log("Time limit reached, ending on exhale.");
                 stopExercise(); // Call the async version
            }
            // If limit is reached, but we are NOT on exhale, continue until the next exhale completes.
            // The nextPhase() call handles continuing the cycle.
            else if (isRunning) { // Only proceed if not already stopped
                nextPhase();
            }
        }
    }


    function updateTotalTime() {
        elapsedSeconds++;
        updateTotalTimeDisplay();

        // Optional: Secondary check for time limit here, though primary logic is in updatePhaseTimer
        // This prevents the total timer from ticking unnecessarily far past the limit if something hangs
         const limitReached = timeLimitSeconds !== null && elapsedSeconds >= timeLimitSeconds;
         if (limitReached && !isRunning) { // If stopped by exhale rule, clear this interval too
            clearInterval(totalTimerInterval);
         }
    }

    // --- Display & Animation Functions ---

    function updatePhaseTimerDisplay() {
        phaseTimerDisplay.textContent = remainingPhaseTime > 0 ? remainingPhaseTime : "";
    }

    function updateTotalTimeDisplay() {
        const minutes = Math.floor(elapsedSeconds / 60);
        const seconds = elapsedSeconds % 60;
        totalTimeDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function resetDotPosition() {
        dot.style.transition = 'none'; // Turn off transition for reset
        // Reset to bottom-left visually (transform centers it on the corner)
        dot.style.transform = `translate(-50%, 50%)`;
        dot.style.bottom = '0';
        dot.style.left = '0';
        dot.style.top = 'auto'; // Ensure top/right are not interfering
        dot.style.right = 'auto';
         // Force reflow to apply reset immediately before re-enabling transition
        void dot.offsetWidth;
    }

    function animateDot(phase, duration) {
         // Make sure dimensions are calculated if not already
         if (boxWidth === 0) {
             boxWidth = boxOutline.clientWidth;
             boxHeight = boxOutline.clientHeight;
         }

        dot.style.transition = `transform ${duration}s linear`;

        let targetTransform = '';

        switch (phase) {
            case 'inhale': // Bottom-left to Top-left
                targetTransform = `translate(-50%, -${boxHeight}px + 50%)`;
                break;
            case 'hold': // Top-left to Top-right
                targetTransform = `translate(${boxWidth}px - 50%, -${boxHeight}px + 50%)`;
                break;
            case 'exhale': // Top-right to Bottom-right
                targetTransform = `translate(${boxWidth}px - 50%, 50%)`;
                break;
            case 'wait': // Bottom-right to Bottom-left
                targetTransform = `translate(-50%, 50%)`;
                break;
        }

        // Apply the calculated transform to start the animation
        dot.style.transform = targetTransform;
    }

}); // End of DOMContentLoaded

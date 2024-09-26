// script.js

// Helper function to format pace in minutes and seconds per 100 meters
function formatPace(paceInSecondsPerMeter) {
    const pacePer100m = paceInSecondsPerMeter * 100;
    const minutes = Math.floor(pacePer100m / 60);
    const seconds = Math.round(pacePer100m % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Function to fetch swim data from the serverless function
async function fetchSwimData() {
    try {
        const response = await fetch('/.netlify/functions/get-swims');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching swim data:', error);
    }
}

// Process the fetched data to compute metrics
function processData(swimData) {
    const processedData = {};

    // Total Distance
    processedData.totalDistance = swimData.reduce((total, session) => total + session.distance, 0);

    // Total Time
    processedData.totalTime = swimData.reduce((total, session) => total + session.moving_time, 0);

    // Average Pace
    processedData.averagePace = processedData.totalTime / processedData.totalDistance;

    // Total Calories
    processedData.totalCalories = swimData.reduce((total, session) => total + (session.calories || 0), 0);

    // Number of Sessions
    processedData.numberOfSessions = swimData.length;

    return processedData;
}

// Update the Overview Section
function updateOverview(processedData) {
    document.getElementById('total-distance').innerHTML = `
        <h3>Total Distance</h3>
        <p>${(processedData.totalDistance / 1000).toFixed(2)} km</p>
    `;

    document.getElementById('total-time').innerHTML = `
        <h3>Total Time</h3>
        <p>${(processedData.totalTime / 3600).toFixed(2)} hours</p>
    `;

    document.getElementById('average-pace').innerHTML = `
        <h3>Average Pace</h3>
        <p>${formatPace(processedData.averagePace)} /100m</p>
    `;

    document.getElementById('total-calories').innerHTML = `
        <h3>Total Calories</h3>
        <p>${Math.round(processedData.totalCalories)} kcal</p>
    `;

    document.getElementById('number-of-sessions').innerHTML = `
        <h3>Number of Sessions</h3>
        <p>${processedData.numberOfSessions}</p>
    `;
}

// Create the Distance Chart
function createDistanceChart(swimData) {
    // Prepare data
    const labels = swimData.map(session => moment(session.start_date).format('YYYY-MM-DD'));
    const distances = swimData.map(session => (session.distance / 1000).toFixed(2)); // Convert to km

    // Create chart
    const ctx = document.getElementById('distanceChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Distance (km)',
                data: distances,
                backgroundColor: '#0277bd',
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: { display: true },
                y: { display: true }
            }
        }
    });
}

// Create the Time Chart
function createTimeChart(swimData) {
    // Prepare data
    const labels = swimData.map(session => moment(session.start_date).format('YYYY-MM-DD'));
    const times = swimData.map(session => (session.moving_time / 60).toFixed(2)); // Convert to minutes

    // Create chart
    const ctx = document.getElementById('timeChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Time (minutes)',
                data: times,
                backgroundColor: '#ef6c00',
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: { display: true },
                y: { display: true }
            }
        }
    });
}

// Create the Pace Chart
function createPaceChart(swimData) {
    // Prepare data
    const labels = swimData.map(session => moment(session.start_date).format('YYYY-MM-DD'));
    const paces = swimData.map(session => session.moving_time / session.distance);

    // Create chart
    const ctx = document.getElementById('paceChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Pace (/100m)',
                data: paces.map(pace => pace * 100),
                borderColor: '#43a047',
                fill: false
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: { display: true },
                y: { 
                    display: true,
                    ticks: {
                        callback: function(value, index, values) {
                            const paceInSecondsPerMeter = value / 100;
                            return formatPace(paceInSecondsPerMeter);
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const paceInSecondsPerMeter = context.parsed.y / 100;
                            return formatPace(paceInSecondsPerMeter) + ' /100m';
                        }
                    }
                }
            }
        }
    });
}

// Create the SWOLF Chart
function createSwolfChart(swimData) {
    // Check if SWOLF data is available
    if (!swimData[0].hasOwnProperty('swim_swolf')) {
        console.warn('SWOLF data not available');
        return;
    }

    const labels = swimData.map(session => moment(session.start_date).format('YYYY-MM-DD'));
    const swolfScores = swimData.map(session => session.swim_swolf);

    const ctx = document.getElementById('swolfChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'SWOLF Score',
                data: swolfScores,
                borderColor: '#8e24aa',
                fill: false
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: { display: true },
                y: { display: true }
            }
        }
    });
}

// Main function to initialize the dashboard
async function initDashboard() {
    const swimData = await fetchSwimData();

    // Sort swimData by date
    swimData.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

    const processedData = processData(swimData);

    // Update Overview Section
    updateOverview(processedData);

    // Create Charts
    createDistanceChart(swimData);
    createTimeChart(swimData);
    createPaceChart(swimData);
    createSwolfChart(swimData); // If SWOLF data is available
}

// Call the main function on page load
window.onload = initDashboard;

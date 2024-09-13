document.getElementById("calculate-button").addEventListener("click", calculate);

function toggleMenu() {
    const navLinks = document.querySelector('.top-nav ul');
    navLinks.classList.toggle('active');
}

function toggleMode() {
    const mode = document.querySelector('input[name="calculation-mode"]:checked').value;
    const timeGroup = document.getElementById('time-group');
    const paceGroup = document.getElementById('pace-group');

    if (mode === 'time') {
        timeGroup.classList.add('hidden');
        paceGroup.classList.remove('hidden');
    } else {
        timeGroup.classList.remove('hidden');
        paceGroup.classList.add('hidden');
    }

    clearResultAndError();
}

function clearResultAndError() {
    document.getElementById('result').innerText = '';
    document.getElementById('error-message').classList.add('hidden');
}

function showError(message) {
    const errorMessage = document.getElementById("error-message");
    errorMessage.innerText = message;
    errorMessage.classList.remove('hidden');
}

function isPositiveNumber(value) {
    return !isNaN(value) && Number(value) > 0;
}

function validateInputs(hours, mins, secs) {
    return (Number(hours) > 0 || Number(mins) > 0 || Number(secs) > 0);
}

function validateSeconds(secs) {
    return !isNaN(secs) && Number(secs) >= 0 && Number(secs) < 60;
}

function calculate() {
    const mode = document.querySelector('input[name="calculation-mode"]:checked').value;
    const distance = document.getElementById("distance").value || 0;
    let paceMins = document.getElementById("pace-mins").value || 0;
    let paceSecs = document.getElementById("pace-secs").value || 0;
    let timeHours = document.getElementById("time-hours").value || 0;
    let timeMins = document.getElementById("time-mins").value || 0;
    let timeSecs = document.getElementById("time-secs").value || 0;

    if (!isPositiveNumber(distance)) {
        showError("Please enter a valid positive distance.");
        return;
    }

    if (mode === 'time') {
        if (!validateSeconds(paceSecs)) {
            showError("Please enter valid seconds for pace.");
            return;
        }

        let totalPace = (Number(paceMins) * 60) + Number(paceSecs);
        let totalTime = (distance / 100) * totalPace;
        let hours = Math.floor(totalTime / 3600);
        totalTime %= 3600;
        let mins = Math.floor(totalTime / 60);
        let secs = (totalTime % 60).toFixed(0);

        let resultText = hours > 0 ? `${hours} hr ` : "";
        resultText += `${mins} min ${secs} sec`;
        document.getElementById("result").innerText = "Time: " + resultText;

    } else if (mode === 'pace') {
        if (!validateInputs(timeHours, timeMins, timeSecs)) {
            showError("Please enter a valid time.");
            return;
        }

        let totalTime = (Number(timeHours) * 3600) + (Number(timeMins) * 60) + Number(timeSecs);
        let totalPace = totalTime / (distance / 100);
        let paceMins = Math.floor(totalPace / 60);
        let paceSecs = (totalPace % 60).toFixed(0);

        document.getElementById("result").innerText = "Pace: " + paceMins + " min " + paceSecs + " sec /100m";
    }

    clearResultAndError();
}

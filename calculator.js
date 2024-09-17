function calculateRepayment() {
    let loanBalance = parseFloat(document.getElementById('loanBalance').value);
    let salary = parseFloat(document.getElementById('salary').value);
    let loanPlan = document.getElementById('loanPlan').value;
    let salaryGrowth = parseFloat(document.getElementById('salaryGrowth').value) / 100;
    let interestRate = parseFloat(document.getElementById('interestRate').value) || getInterestRate(loanPlan, salary);

    let threshold, repaymentRate;
    switch(loanPlan) {
        case "Plan 1":
            threshold = 22015;
            repaymentRate = 0.09;
            break;
        case "Plan 2":
            threshold = 27295;
            repaymentRate = 0.09;
            break;
        case "Plan 4":
            threshold = 27660;
            repaymentRate = 0.09;
            break;
        case "Postgraduate Loan":
            threshold = 21000;
            repaymentRate = 0.06;
            break;
    }

    let years = 30;
    let data = [];
    for (let i = 0; i < years; i++) {
        let annualRepayment = Math.max(0, (salary - threshold) * repaymentRate);
        loanBalance += loanBalance * (interestRate / 100);
        loanBalance -= annualRepayment;
        if (loanBalance <= 0) {
            break;
        }
        data.push(loanBalance);
        salary += salary * salaryGrowth;
    }

    drawGraph(data);
}

function getInterestRate(plan, salary) {
    if (plan === 'Plan 2') {
        return 3 + (salary - 27295) / (50000 - 27295) * 3;  // Custom RPI + 0%-3% rate
    }
    return 1.25;  // Example for simplicity, adjust based on plan
}

function drawGraph(data) {
    let ctx = document.getElementById('repaymentGraph').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map((_, i) => `Year ${i+1}`),
            datasets: [{
                label: 'Loan Balance (£)',
                data: data,
                fill: false,
                borderColor: 'rgba(75, 192, 192, 1)',
                tension: 0.1
            }]
        }
    });
    document.getElementById('results').style.display = 'block';
}

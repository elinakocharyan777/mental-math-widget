class HTMLMentalMathElement extends HTMLElement {
    connectedCallback() {
        class MentalMathWidget {
            constructor(host) {
                this.host = host;
                this.id = host.id;
                this.title = 'Тренировка устного счёта';
                this.cssPath = host.getAttribute('data-css') || 'widget/app.css';
                this.stateKey = 'mental-math-widget-' + this.id;

                this.shadow = host.attachShadow({ mode: 'open' });

                this.linkElement = document.createElement('link');
                this.linkElement.rel = 'stylesheet';
                this.linkElement.href = this.cssPath;

                this.wrapper = document.createElement('div');
                this.wrapper.className = 'widget';

                this.shadow.append(this.linkElement, this.wrapper);

                this.intervalId = null;
                this.state = this.loadState();
                this.normalizeLoadedState();

                this.render();
                this.bindElements();
                this.applyStateToControls();
                this.updateView();
            }

            getDefaultSettings() {
                const requestedLevel = this.host.getAttribute('data-level');
                const level = ['easy', 'medium', 'hard'].includes(requestedLevel) ? requestedLevel : 'easy';
                const requestedDuration = Number(this.host.getAttribute('data-duration'));
                const duration = [30, 45, 60, 90].includes(requestedDuration) ? requestedDuration : 60;

                return {
                    level: level,
                    duration: duration
                };
            }

            getLevelConfig(level) {
                if (level === 'easy') {
                    return {
                        label: 'Лёгкая',
                        maxNumber: 10,
                        operations: ['+', '-']
                    };
                }

                if (level === 'medium') {
                    return {
                        label: 'Средняя',
                        maxNumber: 20,
                        operations: ['+', '-', '*']
                    };
                }

                return {
                    label: 'Сложная',
                    maxNumber: 50,
                    operations: ['+', '-', '*', '/']
                };
            }

            getDefaultState() {
                const settings = this.getDefaultSettings();
                const levelConfig = this.getLevelConfig(settings.level);

                return {
                    isRunning: false,
                    level: settings.level,
                    duration: settings.duration,
                    timeLeft: settings.duration,
                    solved: 0,
                    errors: 0,
                    history: [],
                    currentExpression: '',
                    currentCorrectAnswer: null,
                    operations: levelConfig.operations,
                    maxNumber: levelConfig.maxNumber
                };
            }

            loadState() {
                try {
                    const saved = this.id && localStorage.getItem(this.stateKey);
                    if (saved) return JSON.parse(saved);
                } catch {
                    // Storage can be unavailable; the widget still works in memory.
                }

                return this.getDefaultState();
            }

            normalizeLoadedState() {
                const defaultState = this.getDefaultState();

                if (typeof this.state !== 'object' || this.state === null || Array.isArray(this.state)) {
                    this.state = defaultState;
                }

                this.state.isRunning = false;

                if (!['easy', 'medium', 'hard'].includes(this.state.level)) {
                    this.state.level = defaultState.level;
                }

                this.state.duration = Number(this.state.duration);
                this.state.timeLeft = Number(this.state.timeLeft);
                this.state.solved = Number(this.state.solved);
                this.state.errors = Number(this.state.errors);

                if (![30, 45, 60, 90].includes(this.state.duration)) {
                    this.state.duration = defaultState.duration;
                }

                if (!Number.isInteger(this.state.timeLeft) || this.state.timeLeft < 0 || this.state.timeLeft > this.state.duration) {
                    this.state.timeLeft = this.state.duration;
                }

                if (!Number.isInteger(this.state.solved) || this.state.solved < 0) {
                    this.state.solved = 0;
                }

                if (!Number.isInteger(this.state.errors) || this.state.errors < 0) {
                    this.state.errors = 0;
                }

                if (!Array.isArray(this.state.history)) {
                    this.state.history = [];
                }

                this.state.errors = Math.min(this.state.errors, this.state.solved);
                this.state.history = this.state.history.filter(item =>
                    item && typeof item.expression === 'string' &&
                    Number.isFinite(item.userAnswer) && Number.isFinite(item.correctAnswer)
                ).slice(0, 5);

                if (typeof this.state.currentExpression !== 'string') {
                    this.state.currentExpression = '';
                }

                if (typeof this.state.currentCorrectAnswer !== 'number') {
                    this.state.currentCorrectAnswer = null;
                }

                this.applyLevelSettings(this.state.level, false);
                this.saveState();
            }

            saveState() {
                if (!this.id) return;
                try {
                    localStorage.setItem(this.stateKey, JSON.stringify(this.state));
                } catch {
                    // A blocked or full storage must not interrupt a session.
                }
            }

            formatTime(seconds) {
                const safeSeconds = Math.max(0, seconds);
                const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
                const restSeconds = String(safeSeconds % 60).padStart(2, '0');
                return minutes + ':' + restSeconds;
            }

            getRandomNumber(min, max) {
                return Math.floor(Math.random() * (max - min + 1)) + min;
            }

            getRandomOperation() {
                const index = this.getRandomNumber(0, this.state.operations.length - 1);
                return this.state.operations[index];
            }

            applyLevelSettings(level, resetTime) {
                const config = this.getLevelConfig(level);

                this.state.level = level;
                this.state.operations = config.operations;
                this.state.maxNumber = config.maxNumber;

                if (resetTime) {
                    this.state.timeLeft = this.state.duration;
                }

                this.saveState();
            }

            readSettingsFromControls() {
                this.state.level = this.levelSelectElement.value;
                this.state.duration = Number(this.durationSelectElement.value);

                this.applyLevelSettings(this.state.level, true);
                this.saveState();
            }

            applyStateToControls() {
                this.levelSelectElement.value = this.state.level;
                this.durationSelectElement.value = String(this.state.duration);
                this.updateOperationsText();
            }

            updateOperationsText() {
                const config = this.getLevelConfig(this.state.level);
                const operationLabels = config.operations.map(function (item) {
                    if (item === '*') {
                        return '×';
                    }

                    if (item === '/') {
                        return '÷';
                    }

                    return item;
                });

                this.operationsValueElement.textContent = operationLabels.join(' ');
            }
            createTask() {
                const maxNumber = this.state.maxNumber;
                const operation = this.getRandomOperation();

                let a = this.getRandomNumber(1, maxNumber);
                let b = this.getRandomNumber(1, maxNumber);
                let expression = '';
                let answer = 0;

                if (operation === '+') {
                    expression = a + ' + ' + b + ' = ?';
                    answer = a + b;
                }

                if (operation === '-') {
                    if (a < b) {
                        const temp = a;
                        a = b;
                        b = temp;
                    }

                    expression = a + ' − ' + b + ' = ?';
                    answer = a - b;
                }

                if (operation === '*') {
                    expression = a + ' × ' + b + ' = ?';
                    answer = a * b;
                }

                if (operation === '/') {
                    b = this.getRandomNumber(1, Math.min(maxNumber, 10));
                    answer = this.getRandomNumber(1, Math.min(maxNumber, 10));
                    a = b * answer;
                    expression = a + ' ÷ ' + b + ' = ?';
                }

                this.state.currentExpression = expression;
                this.state.currentCorrectAnswer = answer;
                this.saveState();
            }

            render() {
                this.wrapper.innerHTML = '';

                const title = document.createElement('h3');
                title.className = 'widget-main-title';
                title.textContent = this.title;

                const topSection = document.createElement('section');
                topSection.className = 'widget-top-section';

                const taskBox = document.createElement('div');
                taskBox.className = 'widget-task-box';

                this.taskValueElement = document.createElement('div');
                this.taskValueElement.className = 'widget-task-value';

                const answerRow = document.createElement('div');
                answerRow.className = 'widget-answer-row';

                const answerLabel = document.createElement('span');
                answerLabel.className = 'widget-answer-label';
                answerLabel.textContent = 'Ваш ответ:';

                this.answerInputElement = document.createElement('input');
                this.answerInputElement.className = 'widget-answer-input';
                this.answerInputElement.type = 'number';
                this.answerInputElement.setAttribute('aria-label', 'Ваш ответ');
                this.answerInputElement.step = '1';

                this.answerButtonElement = document.createElement('button');
                this.answerButtonElement.className = 'widget-answer-button';
                this.answerButtonElement.textContent = 'Ответить';

                this.startButtonElement = document.createElement('button');
                this.startButtonElement.className = 'widget-answer-button';
                this.startButtonElement.textContent = 'Начать';

                answerRow.append(answerLabel, this.answerInputElement);
                taskBox.append(
                    this.taskValueElement,
                    answerRow,
                    this.answerButtonElement,
                    this.startButtonElement
                );
                topSection.appendChild(taskBox);

                const middleSection = document.createElement('section');
                middleSection.className = 'widget-middle-section';

                const settingsBox = document.createElement('div');
                settingsBox.className = 'widget-settings-box';

                const settingsHeader = document.createElement('div');
                settingsHeader.className = 'widget-box-header';
                settingsHeader.textContent = 'Настройки тренировки';

                const levelLine = document.createElement('div');
                levelLine.className = 'widget-settings-line';

                const levelLabel = document.createElement('span');
                levelLabel.className = 'widget-settings-label';
                levelLabel.textContent = 'Сложность:';

                this.levelSelectElement = document.createElement('select');
                this.levelSelectElement.className = 'widget-select';
                this.levelSelectElement.setAttribute('aria-label', 'Сложность');

                const easyOption = document.createElement('option');
                easyOption.value = 'easy';
                easyOption.textContent = 'Лёгкая';

                const mediumOption = document.createElement('option');
                mediumOption.value = 'medium';
                mediumOption.textContent = 'Средняя';

                const hardOption = document.createElement('option');
                hardOption.value = 'hard';
                hardOption.textContent = 'Сложная';

                this.levelSelectElement.append(easyOption, mediumOption, hardOption);
                levelLine.append(levelLabel, this.levelSelectElement);

                const operationsLine = document.createElement('div');
                operationsLine.className = 'widget-settings-line';

                const operationsLabel = document.createElement('span');
                operationsLabel.className = 'widget-settings-label';
                operationsLabel.textContent = 'Операции:';

                this.operationsValueElement = document.createElement('span');
                this.operationsValueElement.className = 'widget-settings-value';

                operationsLine.append(operationsLabel, this.operationsValueElement);

                const durationLine = document.createElement('div');
                durationLine.className = 'widget-settings-line';

                const durationLabel = document.createElement('span');
                durationLabel.className = 'widget-settings-label';
                durationLabel.textContent = 'Время:';

                this.durationSelectElement = document.createElement('select');
                this.durationSelectElement.className = 'widget-select';
                this.durationSelectElement.setAttribute('aria-label', 'Время тренировки');

                const duration30 = document.createElement('option');
                duration30.value = '30';
                duration30.textContent = '30 сек';

                const duration45 = document.createElement('option');
                duration45.value = '45';
                duration45.textContent = '45 сек';

                const duration60 = document.createElement('option');
                duration60.value = '60';
                duration60.textContent = '60 сек';

                const duration90 = document.createElement('option');
                duration90.value = '90';
                duration90.textContent = '90 сек';

                this.durationSelectElement.append(duration30, duration45, duration60, duration90);
                durationLine.append(durationLabel, this.durationSelectElement);

                settingsBox.append(
                    settingsHeader,
                    levelLine,
                    operationsLine,
                    durationLine
                );

                const timerBox = document.createElement('div');
                timerBox.className = 'widget-timer-box';

                const timerHeader = document.createElement('div');
                timerHeader.className = 'widget-box-header';
                timerHeader.textContent = 'Таймер';

                this.timerValueElement = document.createElement('div');
                this.timerValueElement.className = 'widget-timer-value';

                this.solvedValueElement = document.createElement('div');
                this.solvedValueElement.className = 'widget-stat-box';

                this.errorValueElement = document.createElement('div');
                this.errorValueElement.className = 'widget-stat-box';

                timerBox.append(
                    timerHeader,
                    this.timerValueElement,
                    this.solvedValueElement,
                    this.errorValueElement
                );

                middleSection.append(settingsBox, timerBox);

                const resultsSection = document.createElement('section');
                resultsSection.className = 'widget-results-section';
                const resultsHeader = document.createElement('div');
                resultsHeader.className = 'widget-box-header widget-results-header';
                resultsHeader.textContent = 'Результаты тренировки';

                this.tableElement = document.createElement('table');
                this.tableElement.className = 'widget-results-table';

                const thead = document.createElement('thead');
                const headRow = document.createElement('tr');

                const headCell1 = document.createElement('th');
                headCell1.className = 'widget-table-cell';
                headCell1.textContent = 'Пример';

                const headCell2 = document.createElement('th');
                headCell2.className = 'widget-table-cell';
                headCell2.textContent = 'Ваш ответ';

                const headCell3 = document.createElement('th');
                headCell3.className = 'widget-table-cell';
                headCell3.textContent = 'Правильный ответ';

                headRow.append(headCell1, headCell2, headCell3);
                thead.appendChild(headRow);

                this.tbodyElement = document.createElement('tbody');

                this.tableElement.append(thead, this.tbodyElement);
                resultsSection.append(resultsHeader, this.tableElement);

                this.wrapper.append(
                    title,
                    topSection,
                    middleSection,
                    resultsSection
                );
            }

            bindElements() {
                const self = this;

                this.startButtonElement.addEventListener('click', function () {
                    if (self.state.isRunning) {
                        self.stopTraining();
                    } else {
                        self.startTraining();
                    }
                });

                this.answerButtonElement.addEventListener('click', function () {
                    self.submitAnswer();
                });

                this.answerInputElement.addEventListener('keydown', function (event) {
                    if (event.key === 'Enter') {
                        self.submitAnswer();
                    }
                });

                this.levelSelectElement.addEventListener('change', function () {
                    self.readSettingsFromControls();
                    self.updateOperationsText();

                    if (self.state.isRunning) {
                        self.createTask();
                    }

                    self.updateView();
                });

                this.durationSelectElement.addEventListener('change', function () {
                    self.readSettingsFromControls();
                    self.updateView();
                });
            }

            startTraining() {
                this.stopTimer();
                this.readSettingsFromControls();

                this.state.isRunning = true;
                this.deadline = Date.now() + this.state.duration * 1000;
                this.answerInputElement.value = '';
                this.state.timeLeft = this.state.duration;
                this.state.solved = 0;
                this.state.errors = 0;
                this.state.history = [];
                this.state.currentExpression = '';
                this.state.currentCorrectAnswer = null;

                this.createTask();
                this.saveState();
                this.updateView();

                const self = this;

                this.intervalId = setInterval(function () {
                    self.state.timeLeft = Math.max(0, Math.ceil((self.deadline - Date.now()) / 1000));

                    if (self.state.timeLeft <= 0) {
                        self.state.timeLeft = 0;
                        self.finishTraining();
                        return;
                    }

                    self.saveState();
                    self.updateView();
                }, 1000);
            }

            stopTraining() {
                this.stopTimer();
                this.state.isRunning = false;
                this.saveState();
                this.updateView();
            }

            stopTimer() {
                if (this.intervalId !== null) {
                    clearInterval(this.intervalId);
                    this.intervalId = null;
                }
            }

            finishTraining() {
                this.stopTimer();
                this.state.isRunning = false;
                this.saveState();
                this.updateView();
            }

            submitAnswer() {
                if (!this.state.isRunning) return;
                if (Date.now() >= this.deadline) {
                    this.state.timeLeft = 0;
                    this.finishTraining();
                    return;
                }

                const rawValue = this.answerInputElement.value.trim();

                if (rawValue === '') {
                    return;
                }

                const userAnswer = Number(rawValue);
                if (!Number.isFinite(userAnswer)) return;
                const correctAnswer = this.state.currentCorrectAnswer;
                const expression = this.state.currentExpression;

                this.state.solved = this.state.solved + 1;

                if (userAnswer !== correctAnswer) {
                    this.state.errors = this.state.errors + 1;
                    this.state.history.unshift({
                        expression: expression.replace(' = ?', ' ='),
                        userAnswer: userAnswer,
                        correctAnswer: correctAnswer
                    });

                    if (this.state.history.length > 5) {
                        this.state.history = this.state.history.slice(0, 5);
                    }
                }

                this.createTask();
                this.answerInputElement.value = '';
                this.saveState();
                this.updateView();
            }

            updateHistoryTable() {
                this.tbodyElement.innerHTML = '';

                if (this.state.history.length === 0) {
                    const row = document.createElement('tr');

                    const cell = document.createElement('td');
                    cell.className = 'widget-table-cell';
                    cell.colSpan = 3;
                    cell.textContent = 'Пока ошибок нет';

                    row.appendChild(cell);
                    this.tbodyElement.appendChild(row);
                    return;
                }

                this.state.history.forEach(function (item, index) {
                    const row = document.createElement('tr');

                    const cell1 = document.createElement('td');
                    cell1.className = 'widget-table-cell';
                    cell1.textContent = index + 1 + ') ' + item.expression;

                    const cell2 = document.createElement('td');
                    cell2.className = 'widget-table-cell';
                    cell2.textContent = String(item.userAnswer);

                    const cell3 = document.createElement('td');
                    cell3.className = 'widget-table-cell';
                    cell3.textContent = String(item.correctAnswer);

                    row.append(cell1, cell2, cell3);
                    this.tbodyElement.appendChild(row);
                }, this);
            }

            updateView() {
                if (this.state.currentExpression) {
                    this.taskValueElement.textContent = this.state.currentExpression;
                } else {
                    this.taskValueElement.textContent = 'Нажмите «Начать»';
                }

                this.timerValueElement.textContent =
                    'Осталось: ' + this.formatTime(this.state.timeLeft);

                this.solvedValueElement.textContent = 'Решено: ' + this.state.solved;
                this.errorValueElement.textContent = 'Ошибки: ' + this.state.errors;

                this.levelSelectElement.disabled = this.state.isRunning;
                this.durationSelectElement.disabled = this.state.isRunning;
                this.answerInputElement.disabled = !this.state.isRunning;
                this.answerButtonElement.disabled = !this.state.isRunning;

                if (this.state.isRunning) {
                    this.startButtonElement.textContent = 'Остановить';
                } else {
                    this.startButtonElement.textContent = 'Начать';
                }

                this.updateOperationsText();
                this.updateHistoryTable();
            }
        }

        if (!this.widget) {
            this.widget = new MentalMathWidget(this);
        }
    }

    disconnectedCallback() {
        if (this.widget) this.widget.stopTraining();
    }
}

if (!customElements.get('mental-math-widget')) {
    customElements.define('mental-math-widget', HTMLMentalMathElement);
}

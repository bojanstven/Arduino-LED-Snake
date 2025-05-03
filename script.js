// Gamepad handling code
const fudgeFactor = 2;  // because of bug in Chrome related to svg text alignment font sizes can not be < 1
const runningElem = document.querySelector('#running');
const gamepadsElem = document.querySelector('#gamepads');
const gamepadsByIndex = {};

// Serial connection variables
let serialPort = null;
let serialWriter = null;
let serialReader = null;
let serialConnected = false;
const AXIS_THRESHOLD = 0.20; // 20% movement to trigger direction
let lastDirection = null;
let lastCommandTime = 0;
const MIN_COMMAND_INTERVAL = 100; // ms between commands

// Game state tracking
let snakePosition = {
  headX: 0,
  headY: 0
};
let currentScore = 0;
let currentLevel = 1;
let gameOver = false;
let speedControlLastPressed = false;

// Input states
let inputStates = {
  up: false,
  down: false,
  left: false,
  right: false
};

// Keyboard tracking
const pressedKeys = new Set();
let keyboardPollingInterval = null;
const KEY_POLLING_RATE = 50; // Poll keyboard every 50ms (20 times per second)

// Game stats elements
const scoreElement = document.getElementById('score-value');
const levelElement = document.getElementById('level-value');
const gameStatusElement = document.getElementById('game-status');

// Serial connection functions
async function connectToSerial() {
  console.log('Attempting to connect to Arduino via Serial...');
  
  if (serialConnected) {
    console.log('Already connected');
    return;
  }
  
  try {
    // Request port access from the user
    serialPort = await navigator.serial.requestPort();
    
    // Open the port with correct settings for Arduino (9600 baud)
    await serialPort.open({ baudRate: 9600 });
    console.log('Serial port opened at 9600 baud');
    
    // Create writer for output
    const textEncoder = new TextEncoder();
    const writableStream = serialPort.writable;
    const writer = writableStream.getWriter();
    serialWriter = writer;
    
    // Setup reader for incoming messages
    setupSerialReader();
    
    // Update UI and status
    serialConnected = true;
    document.getElementById('serial-status').textContent = 'Connected';
    document.getElementById('status-icon').textContent = '✅'; // Green checkmark
    document.getElementById('connect-once').textContent = 'Connected';
    document.getElementById('connect-once').disabled = true;
    
    console.log('Serial connection established successfully!');
    updateGameStatus('Connected! Use controls to play. To disconnect, refresh this page.');
  } catch (error) {
    console.error('Error connecting to serial port:', error);
    document.getElementById('serial-status').textContent = 'Connection Failed';
    document.getElementById('status-icon').textContent = '❌'; // Red cross
    updateGameStatus('Connection failed. Please try again.');
  }
}

async function setupSerialReader() {
  if (!serialPort || !serialPort.readable) {
    console.error('No serial port available for reading');
    return;
  }
  
  const textDecoder = new TextDecoder();
  let readBuffer = '';
  
  while (serialPort && serialPort.readable) {
    try {
      serialReader = serialPort.readable.getReader();
      
      try {
        while (true) {
          const { value, done } = await serialReader.read();
          if (done) {
            console.log('Serial reader closed');
            break;
          }
          
          // Convert the received bytes to text
          const text = textDecoder.decode(value);
          readBuffer += text;
          
          // Process complete lines
          let lineEnd = readBuffer.indexOf('\n');
          while (lineEnd >= 0) {
            const line = readBuffer.substring(0, lineEnd).trim();
            if (line) {
              processArduinoMessage(line);
            }
            readBuffer = readBuffer.substring(lineEnd + 1);
            lineEnd = readBuffer.indexOf('\n');
          }
        }
      } catch (error) {
        console.error('Error reading from serial port:', error);
      } finally {
        try {
          serialReader.releaseLock();
        } catch (err) {
          console.error('Error releasing reader lock:', err);
        }
      }
    } catch (error) {
      console.error('Serial port reading error:', error);
      break;
    }
  }
}

// Process messages from Arduino
function processArduinoMessage(message) {
  console.log(`Arduino: ${message}`);
  
  // Parse special message formats
  if (message.startsWith("SCORE:")) {
    const score = parseInt(message.substring(6));
    currentScore = score;
    updateScoreDisplay();
  } 
  else if (message.startsWith("LEVEL_UP:")) {
    const level = parseInt(message.substring(9));
    currentLevel = level;
    updateLevelDisplay();
    updateGameStatus(`Level up! Now at level ${level}`);
  }
  else if (message.startsWith("LEVEL_DOWN:")) {
    const level = parseInt(message.substring(11));
    currentLevel = level;
    updateLevelDisplay();
    updateGameStatus(`Level set to ${level}`);
  }
  else if (message.startsWith("GAME_OVER:")) {
    gameOver = true;
    updateGameStatus('Game Over! Press space bar to restart.');
  }
  else if (message.startsWith("GAME_RESET")) {
    gameOver = false;
    currentScore = 0;
    currentLevel = 1;
    updateScoreDisplay();
    updateLevelDisplay();
    updateGameStatus('New game started. Good luck!');
  }
  
  // Parse snake head position from Arduino message
  if (message.includes("Snake head:")) {
    const match = message.match(/\((\d+),\s*(\d+)\)/);
    if (match) {
      snakePosition.headX = parseInt(match[1]);
      snakePosition.headY = parseInt(match[2]);
      console.log(`Snake head tracked at (${snakePosition.headX}, ${snakePosition.headY})`);
    }
  }
}

// Update the score display
function updateScoreDisplay() {
  if (scoreElement) {
    scoreElement.textContent = currentScore;
  }
}

// Update the level display
function updateLevelDisplay() {
  if (levelElement) {
    levelElement.textContent = currentLevel;
  }
}

// Update game status message
function updateGameStatus(message) {
  if (gameStatusElement) {
    gameStatusElement.textContent = message;
  }
}

// Handle inputs with immediate command sending
function handleDirectionInput(direction) {
  if (!direction) return;
  
  // Check timing to prevent flooding commands
  const now = Date.now();
  if (now - lastCommandTime < MIN_COMMAND_INTERVAL) {
    return;
  }
  
  // Set the input state
  inputStates[direction] = true;
  lastCommandTime = now;
  
  // Send command immediately
  sendSerialCommand(direction);
}

// Reset all direction input states
function clearDirectionInputs() {
  inputStates.up = false;
  inputStates.down = false;
  inputStates.left = false;
  inputStates.right = false;
}

// Handle speed boost (when keys are held down or joystick pushed far)
function handleSpeedBoost(activate) {
  if (!serialConnected || !serialWriter) {
    console.log('Cannot send speed command: Serial not connected');
    return;
  }
  
  try {
    const command = activate ? 'F' : 'N'; // F for fast, N for normal
    console.log(`Setting speed: ${activate ? 'FAST' : 'NORMAL'}`);
    const encoder = new TextEncoder();
    serialWriter.write(encoder.encode(command));
  } catch (error) {
    console.error('Error sending speed command:', error);
  }
}

// Send restart command
function sendRestartCommand() {
  if (!serialConnected || !serialWriter) {
    console.log('Cannot send restart command: Serial not connected');
    return;
  }
  
  try {
    console.log('Sending restart command');
    const encoder = new TextEncoder();
    serialWriter.write(encoder.encode('X'));
  } catch (error) {
    console.error('Error sending restart command:', error);
  }
}

// Send speed control command
function sendSpeedControlCommand(command) {
  if (!serialConnected || !serialWriter) {
    console.log('Cannot send speed control command: Serial not connected');
    return;
  }
  
  try {
    const cmd = command === 'increase' ? '+' : '-';
    console.log(`Sending speed ${command} command`);
    const encoder = new TextEncoder();
    serialWriter.write(encoder.encode(cmd));
  } catch (error) {
    console.error('Error sending speed control command:', error);
  }
}

// Send direction command to Arduino
async function sendSerialCommand(direction) {
  if (!serialConnected || !serialWriter) {
    console.log('Cannot send command: Serial not connected');
    return;
  }
  
  // Map direction to serial command
  let command = '';
  switch (direction) {
    case 'up': command = 'U'; break;
    case 'down': command = 'D'; break;
    case 'left': command = 'L'; break;
    case 'right': command = 'R'; break;
    default: return; // Invalid direction
  }
  
  try {
    console.log(`Sending serial command: ${command} (${direction})`);
    const encoder = new TextEncoder();
    await serialWriter.write(encoder.encode(command));
    lastDirection = direction;
  } catch (error) {
    console.error('Error sending serial command:', error);
  }
}

// Gamepad controller templates
const controllerTemplate = `
<div>
  <div class="head"><div class="index"></div><div class="id"></div></div>
  <div class="info"><div class="label">connected:</div><span class="connected"></span></div>
  <div class="info"><div class="label">mapping:</div><span class="mapping"></span></div>
  <div class="inputs">
    <div class="axes"></div>
    <div class="buttons"></div>
  </div>
</div>
`;

const axisTemplate = `
<svg viewBox="-2.2 -2.2 4.4 4.4" width="128" height="128">
    <circle cx="0" cy="0" r="2" fill="none" stroke="#888" stroke-width="0.04" />
    <path d="M0,-2L0,2M-2,0L2,0" stroke="#888" stroke-width="0.04" />
    <circle cx="0" cy="0" r="0.22" fill="red" class="axis" />
    <text text-anchor="middle" fill="#CCC" x="0" y="2">0</text>
</svg>
`;

const buttonTemplate = `
<svg viewBox="-2.2 -2.2 4.4 4.4" width="64" height="64">
  <circle cx="0" cy="0" r="2" fill="none" stroke="#888" stroke-width="0.1" />
  <circle cx="0" cy="0" r="0" fill="none" fill="red" class="button" />
  <text class="value" dominant-baseline="middle" text-anchor="middle" fill="#CCC" x="0" y="0">0.00</text>
  <text class="index" alignment-baseline="hanging" dominant-baseline="hanging" text-anchor="start" fill="#CCC" x="-2" y="-2">0</text>
</svg>
`;

// Add a new gamepad to the UI
function addGamepad(gamepad) {
  console.log('Adding gamepad:', gamepad.index, gamepad.id);
  const elem = document.createElement('div');
  elem.innerHTML = controllerTemplate;

  const axesElem = elem.querySelector('.axes');
  const buttonsElem = elem.querySelector('.buttons');
  
  const axes = [];
  for (let ndx = 0; ndx < gamepad.axes.length; ndx += 2) {
    const div = document.createElement('div');
    div.innerHTML = axisTemplate;
    axesElem.appendChild(div);
    axes.push({
      axis: div.querySelector('.axis'),
      value: div.querySelector('text'),
    });
  }

  const buttons = [];
  for (let ndx = 0; ndx < gamepad.buttons.length; ++ndx) {
    const div = document.createElement('div');
    div.innerHTML = buttonTemplate;
    buttonsElem.appendChild(div);
    div.querySelector('.index').textContent = ndx;
    buttons.push({
      circle: div.querySelector('.button'),
      value: div.querySelector('.value'),
    });
  }

  gamepadsByIndex[gamepad.index] = {
    gamepad,
    elem,
    axes,
    buttons,
    index: elem.querySelector('.index'),
    id: elem.querySelector('.id'),
    mapping: elem.querySelector('.mapping'),
    connected: elem.querySelector('.connected'),
  };
  gamepadsElem.appendChild(elem);
  
  // Update game status
  updateGameStatus('Gamepad connected! Ready to play.');
}

// Remove a gamepad from the UI
function removeGamepad(gamepad) {
  const info = gamepadsByIndex[gamepad.index];
  if (info) {
    delete gamepadsByIndex[gamepad.index];
    info.elem.parentElement.removeChild(info.elem);
    
    // Update game status
    updateGameStatus('Gamepad disconnected. You can use keyboard controls.');
    
    // Create placeholder gamepad display if there are no other gamepads
    if (Object.keys(gamepadsByIndex).length === 0) {
      createGamepadPlaceholder();
    }
  }
}

// Create a placeholder gamepad display when no gamepads are connected
function createGamepadPlaceholder() {
  const placeholderElem = document.createElement('div');
  placeholderElem.className = 'gamepad-placeholder';
  placeholderElem.innerHTML = `
    <div class="placeholder-message">
      <div class="placeholder-icon">🎮</div>
      <div class="placeholder-text">
        <p>No gamepad detected.</p>
        <p>Connect a gamepad or use keyboard controls:</p>
        <ul>
          <li>WASD or Arrow Keys: Move snake</li>
          <li>Hold any direction: Speed boost</li>
          <li>Space Bar: Restart after game over</li>
        </ul>
      </div>
    </div>
  `;
  
  // Add placeholder ID for easy removal later
  placeholderElem.id = 'gamepad-placeholder';
  
  // Add to the gamepads container
  gamepadsElem.appendChild(placeholderElem);
}

// Add gamepad if not already tracked
function addGamepadIfNew(gamepad) {
  // Remove placeholder if it exists
  const placeholder = document.getElementById('gamepad-placeholder');
  if (placeholder) {
    placeholder.parentElement.removeChild(placeholder);
  }
  
  const info = gamepadsByIndex[gamepad.index];
  if (!info) {
    addGamepad(gamepad);
  } else {
    info.gamepad = gamepad;
  }
}

// Event handlers for gamepad connection/disconnection
function handleConnect(e) {
  console.log('Gamepad connected:', e.gamepad.id);
  addGamepadIfNew(e.gamepad);
}

function handleDisconnect(e) {
  console.log('Gamepad disconnected:', e.gamepad.id);
  removeGamepad(e.gamepad);
}

// Process gamepad controller inputs
function processController(info) {
  const {gamepad, axes, buttons} = info;
  
  // Update UI elements
  const keys = ['index', 'id', 'connected', 'mapping'];
  for (const key of keys) {
    info[key].textContent = gamepad[key];
  }
  
  // Process controller inputs
  let anyActive = false;
  let shouldBoost = false;
  
  // Process left joystick input (axes 0-1)
  if (gamepad.axes.length >= 2) {
    const horizontalAxis = gamepad.axes[0];
    const verticalAxis = gamepad.axes[1];

    // Check if joystick is pushed far enough for boost
    if (Math.abs(verticalAxis) > 0.7 || Math.abs(horizontalAxis) > 0.7) {
      shouldBoost = true;
    }
    
    // Process joystick - prioritize the dominant direction (no diagonal)
    if (Math.abs(verticalAxis) > Math.abs(horizontalAxis)) {
      // Vertical movement is dominant
      if (verticalAxis < -AXIS_THRESHOLD) {
        handleDirectionInput('up');
        anyActive = true;
      } else if (verticalAxis > AXIS_THRESHOLD) {
        handleDirectionInput('down');
        anyActive = true;
      }
    } else if (Math.abs(horizontalAxis) > AXIS_THRESHOLD) {
      // Horizontal movement is dominant
      if (horizontalAxis < -AXIS_THRESHOLD) {
        handleDirectionInput('left');
        anyActive = true;
      } else if (horizontalAxis > AXIS_THRESHOLD) {
        handleDirectionInput('right');
        anyActive = true;
      }
    }
  }
  
  // Process right joystick input (axes 2-3)
  if (gamepad.axes.length >= 4) {
    const horizontalAxis = gamepad.axes[2];
    const verticalAxis = gamepad.axes[3];
    
    // Process joystick - prioritize the dominant direction (no diagonal)
    if (Math.abs(verticalAxis) > Math.abs(horizontalAxis)) {
      // Vertical movement is dominant
      if (verticalAxis < -AXIS_THRESHOLD) {
        handleDirectionInput('up');
        anyActive = true;
      } else if (verticalAxis > AXIS_THRESHOLD) {
        handleDirectionInput('down');
        anyActive = true;
      }
    } else if (Math.abs(horizontalAxis) > AXIS_THRESHOLD) {
      // Horizontal movement is dominant
      if (horizontalAxis < -AXIS_THRESHOLD) {
        handleDirectionInput('left');
        anyActive = true;
      } else if (horizontalAxis > AXIS_THRESHOLD) {
        handleDirectionInput('right');
        anyActive = true;
      }
    }
  }
  
  // Process D-pad buttons (usually 12-15 on Pro Controller)
  if (gamepad.buttons.length >= 16) {
    if (gamepad.buttons[12] && gamepad.buttons[12].pressed) {
      handleDirectionInput('up');
      anyActive = true;
    }
    else if (gamepad.buttons[13] && gamepad.buttons[13].pressed) {
      handleDirectionInput('down');
      anyActive = true;
    }
    else if (gamepad.buttons[14] && gamepad.buttons[14].pressed) {
      handleDirectionInput('left');
      anyActive = true;
    }
    else if (gamepad.buttons[15] && gamepad.buttons[15].pressed) {
      handleDirectionInput('right');
      anyActive = true;
    }
  }
  
  // Check L/ZL (buttons 4 and 6 on Pro Controller) for decrease speed
  if ((gamepad.buttons[4] && gamepad.buttons[4].pressed) || 
      (gamepad.buttons[6] && gamepad.buttons[6].pressed)) {
    if (!speedControlLastPressed) {
      speedControlLastPressed = true;
      sendSpeedControlCommand('decrease');
    }
  } 
  // Check R/ZR (buttons 5 and 7 on Pro Controller) for increase speed
  else if ((gamepad.buttons[5] && gamepad.buttons[5].pressed) || 
          (gamepad.buttons[7] && gamepad.buttons[7].pressed)) {
    if (!speedControlLastPressed) {
      speedControlLastPressed = true;
      sendSpeedControlCommand('increase');
    }
  } else {
    speedControlLastPressed = false;
  }
  
  // Check A/B/X/Y buttons for restart (0-3 on standard gamepads)
  if (gameOver) {
    for (let i = 0; i < 4 && i < gamepad.buttons.length; i++) {
      if (gamepad.buttons[i] && gamepad.buttons[i].pressed) {
        sendRestartCommand();
        break;
      }
    }
  }
  
  // If any inputs are active and joystick is pushed far, activate boost
  if (anyActive) {
    handleSpeedBoost(shouldBoost);
  } else {
    // If no inputs are active, clear all states and reset speed
    clearDirectionInputs();
    handleSpeedBoost(false);
  }
  
  // Update visualizations
  axes.forEach(({axis, value}, ndx) => {
    const off = ndx * 2;
    if (off + 1 < gamepad.axes.length) {
      axis.setAttributeNS(null, 'cx', gamepad.axes[off] * fudgeFactor);
      axis.setAttributeNS(null, 'cy', gamepad.axes[off + 1] * fudgeFactor);
      value.textContent = `${gamepad.axes[off].toFixed(2).padStart(5)},${gamepad.axes[off + 1].toFixed(2).padStart(5)}`;
    }
  });
  
  buttons.forEach(({circle, value}, ndx) => {
    if (ndx < gamepad.buttons.length) {
      const button = gamepad.buttons[ndx];
      circle.setAttributeNS(null, 'r', button.value * fudgeFactor);
      circle.setAttributeNS(null, 'fill', button.pressed ? 'red' : 'gray');
      value.textContent = `${button.value.toFixed(2)}`;
    }
  });
}

// Check for new gamepads
function addNewPads() {
  const gamepads = navigator.getGamepads();
  let gamepadFound = false;
  
  for (let i = 0; i < gamepads.length; i++) {
    const gamepad = gamepads[i];
    if (gamepad) {
      gamepadFound = true;
      addGamepadIfNew(gamepad);
    }
  }
  
  // If no gamepads were found, ensure we have a placeholder
  if (!gamepadFound && Object.keys(gamepadsByIndex).length === 0) {
    const placeholder = document.getElementById('gamepad-placeholder');
    if (!placeholder) {
      createGamepadPlaceholder();
    }
  }
}

// Register gamepad event listeners
window.addEventListener("gamepadconnected", handleConnect);
window.addEventListener("gamepaddisconnected", handleDisconnect);

// Main game loop
function process() {
  runningElem.textContent = ((performance.now() * 0.001 * 60 | 0) % 100).toString().padStart(2, '0');
  addNewPads();  // some browsers add by polling, others by event

  // Process all connected gamepads
  Object.values(gamepadsByIndex).forEach(processController);
  
  // Continue the game loop
  requestAnimationFrame(process);
}

// Check if a specific key is pressed
function isKeyPressed(key) {
  return pressedKeys.has(key);
}

// Poll keyboard inputs
function pollKeyboard() {
  // Process only one key at a time - prioritize in this order
  let direction = null;
  
  if (isKeyPressed('arrowup') || isKeyPressed('w')) {
    direction = 'up';
  } else if (isKeyPressed('arrowdown') || isKeyPressed('s')) {
    direction = 'down';
  } else if (isKeyPressed('arrowleft') || isKeyPressed('a')) {
    direction = 'left';
  } else if (isKeyPressed('arrowright') || isKeyPressed('d')) {
    direction = 'right';
  }
  
  if (direction) {
    handleDirectionInput(direction);
  } else if (keyboardPollingInterval) {
    // No direction keys pressed, stop polling
    clearInterval(keyboardPollingInterval);
    keyboardPollingInterval = null;
  }
}

// Check if any direction keys are pressed
function hasDirectionKeysPressed() {
  const directionKeys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  return directionKeys.some(key => pressedKeys.has(key));
}

// Keyboard event handlers
document.addEventListener('keydown', function(event) {
  const key = event.key.toLowerCase();
  
  // Skip if already pressed (avoid duplicates)
  if (pressedKeys.has(key)) {
    // Only activate speed boost if the direction isn't opposite to current direction
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      // Check if key direction matches current direction
      let keyDirection = '';
      switch (key) {
        case 'w': case 'arrowup': keyDirection = 'up'; break;
        case 's': case 'arrowdown': keyDirection = 'down'; break;
        case 'a': case 'arrowleft': keyDirection = 'left'; break;
        case 'd': case 'arrowright': keyDirection = 'right'; break;
      }
      
      // Only boost if it's not opposite to the current direction
      const oppositeDirections = {
        'up': 'down',
        'down': 'up',
        'left': 'right',
        'right': 'left'
      };
      if (lastDirection && oppositeDirections[lastDirection] !== keyDirection) {
        handleSpeedBoost(true);
      }
    }
    return;
  }
  
  // Add to pressed keys set
  pressedKeys.add(key);
  
  // Update visual key feedback
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    const keyElem = document.getElementById(`key-${key === 'arrowup' ? 'up' : key === 'arrowdown' ? 'down' : key === 'arrowleft' ? 'left' : key === 'arrowright' ? 'right' : key}`);
    if (keyElem) keyElem.classList.add('active');
    
    // Send serial command immediately on first press
    let direction = null;
    switch (key) {
      case 'w':
      case 'arrowup': 
        direction = 'up';
        break;
      case 's':
      case 'arrowdown': 
        direction = 'down';
        break;
      case 'a':
      case 'arrowleft': 
        direction = 'left';
        break;
      case 'd':
      case 'arrowright': 
        direction = 'right';
        break;
    }
    
    if (direction) {
      handleDirectionInput(direction);
      
      // Start polling if not already started
      if (!keyboardPollingInterval) {
        keyboardPollingInterval = setInterval(pollKeyboard, KEY_POLLING_RATE);
      }
    }
  }

  // Only space bar to restart after game over
  if (gameOver && key === ' ') {
    sendRestartCommand();
  }
});

document.addEventListener('keyup', function(event) {
  const key = event.key.toLowerCase();
  pressedKeys.delete(key);
  
  // Update visual feedback
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    const keyElem = document.getElementById(`key-${key === 'arrowup' ? 'up' : key === 'arrowdown' ? 'down' : key === 'arrowleft' ? 'left' : key === 'arrowright' ? 'right' : key}`);
    if (keyElem) keyElem.classList.remove('active');
    
    // Set speed back to normal if all direction keys are released
    if (!hasDirectionKeysPressed()) {
      handleSpeedBoost(false);
    }
  }
  
  // Stop polling if no direction keys are pressed
  if (!hasDirectionKeysPressed()) {
    if (keyboardPollingInterval) {
      clearInterval(keyboardPollingInterval);
      keyboardPollingInterval = null;
    }
  }
});

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  // Add connect button listener
  const connectButton = document.getElementById('connect-once');
  if (connectButton) {
    connectButton.addEventListener('click', connectToSerial);
  }
  
  // Set initial status icon
  const statusIcon = document.getElementById('status-icon');
  if (statusIcon) {
    statusIcon.textContent = '❌'; // Start with red cross
  }
  
  // Initialize score and level displays
  updateScoreDisplay();
  updateLevelDisplay();
  
  // Create gamepad placeholder for initial display
  createGamepadPlaceholder();
  
  // Check if Web Serial API is available
  if (!navigator.serial) {
    console.error('Web Serial API not supported!');
    document.getElementById('serial-status').textContent = 'API Not Supported';
    updateGameStatus('Web Serial API not supported in this browser. Try Chrome or Edge.');
    if (connectButton) {
      connectButton.disabled = true;
    }
  } else {
    updateGameStatus('Connect to Arduino to start playing.');
  }
  
  // Start the game loop
  requestAnimationFrame(process);
});
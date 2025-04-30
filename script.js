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

// Current snake position tracking
let snakePosition = {
  headX: 0,
  headY: 0
};

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

// Serial connection functions
async function connectToSerial() {
  // If already connected, disconnect first
  if (serialConnected) {
    await disconnectFromSerial();
    return;
  }
  
  try {
    console.log('Attempting to connect to Arduino via Serial...');
    
    // Request port access from the user
    serialPort = await navigator.serial.requestPort();
    
    // Open the port with correct settings for Arduino (9600 baud)
    await serialPort.open({ baudRate: 9600 });
    console.log('Serial port opened at 9600 baud');
    
    // Create writer for output
    const textEncoder = new TextEncoder();
    const writableStream = serialPort.writable;
    serialWriter = writableStream.getWriter();
    
    // Setup reader for incoming messages
    setupSerialReader();
    
    // Update UI and status
    serialConnected = true;
    document.getElementById('serial-status').textContent = 'Connected';
    document.getElementById('connect-serial').textContent = 'Disconnect';
    
    console.log('Serial connection established successfully!');
  } catch (error) {
    console.error('Error connecting to serial port:', error);
    document.getElementById('serial-status').textContent = 'Connection Failed';
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
        serialReader.releaseLock();
      }
    } catch (error) {
      console.error('Serial port reading error:', error);
      break;
    }
  }
}

// Process messages from Arduino
function processArduinoMessage(message) {
  console.log(`Arduino says: ${message}`);
  
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

async function disconnectFromSerial() {
  console.log('Disconnecting from serial port...');
  
  // Close the reader if it exists
  if (serialReader) {
    try {
      await serialReader.cancel();
      console.log('Serial reader canceled');
    } catch (error) {
      console.error('Error canceling serial reader:', error);
    }
    serialReader = null;
  }
  
  // Close the writer if it exists
  if (serialWriter) {
    try {
      await serialWriter.close();
      console.log('Serial writer closed');
    } catch (error) {
      console.error('Error closing serial writer:', error);
    }
    serialWriter = null;
  }
  
  // Close the port if it exists
  if (serialPort) {
    try {
      await serialPort.close();
      console.log('Serial port closed');
    } catch (error) {
      console.error('Error closing serial port:', error);
    }
    serialPort = null;
  }
  
  // Update state and UI
  serialConnected = false;
  document.getElementById('serial-status').textContent = 'Disconnected';
  document.getElementById('connect-serial').textContent = 'Connect Arduino';
  
  console.log('Serial disconnection complete');
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
}

// Remove a gamepad from the UI
function removeGamepad(gamepad) {
  const info = gamepadsByIndex[gamepad.index];
  if (info) {
    delete gamepadsByIndex[gamepad.index];
    info.elem.parentElement.removeChild(info.elem);
  }
}

// Add gamepad if not already tracked
function addGamepadIfNew(gamepad) {
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
  
  // Check other action buttons for restart
  if (gamepad.buttons.length >= 3 && gamepad.buttons[2] && gamepad.buttons[2].pressed) {
    // X button (usually button 2) for restart
    if (serialConnected && serialWriter) {
      const encoder = new TextEncoder();
      serialWriter.write(encoder.encode('X'));
      console.log('Sending restart command from gamepad');
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
  for (let i = 0; i < gamepads.length; i++) {
    const gamepad = gamepads[i];
    if (gamepad) {
      addGamepadIfNew(gamepad);
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
    // If a direction key is already pressed and held, activate fast mode
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      handleSpeedBoost(true);
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

  // X key to restart after game over
  if (key === 'x') {
    if (serialConnected && serialWriter) {
      const encoder = new TextEncoder();
      serialWriter.write(encoder.encode('X'));
      console.log('Sending restart command');
    }
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
  const connectButton = document.getElementById('connect-serial');
  if (connectButton) {
    connectButton.addEventListener('click', connectToSerial);
  }
  
  // Check if Web Serial API is available
  if (!navigator.serial) {
    console.error('Web Serial API not supported!');
    document.getElementById('serial-status').textContent = 'API Not Supported';
    if (connectButton) {
      connectButton.disabled = true;
    }
  }
  
  // Start the game loop
  requestAnimationFrame(process);
});
#include "Arduino_LED_Matrix.h" // Include the LED_Matrix library
#include "Modulino.h" // Include the Modulino library

// Grid dimensions
#define MAX_Y 8
#define MAX_X 12

// Game parameters
#define INITIAL_SNAKE_LENGTH 3
#define DEFAULT_SPEED 250 // milliseconds between moves (4 per second)
#define FAST_SPEED 125 // fast speed when button held

// Direction constants
#define DIR_UP 0
#define DIR_RIGHT 1
#define DIR_DOWN 2
#define DIR_LEFT 3

// Initialize the LED matrix object
ArduinoLEDMatrix matrix;
ModulinoButtons buttons;

// Game state. 0 is empty, 1 is snake body, 2 is food
uint8_t grid[MAX_Y][MAX_X] = {0}; // Initialize all to empty

// Snake representation
struct SnakeSegment {
  int x;
  int y;
};

const int MAX_SNAKE_LENGTH = MAX_X * MAX_Y;
SnakeSegment snake[MAX_SNAKE_LENGTH];
int snakeLength = INITIAL_SNAKE_LENGTH;
int currentDirection = DIR_RIGHT;
int nextDirection = DIR_RIGHT;

// Food position
int foodX;
int foodY;

// Game timing variables
unsigned long lastMoveTime = 0;
unsigned long moveInterval = DEFAULT_SPEED;
bool fastMove = false;
bool gameOver = false;

void setup() {
  Serial.begin(9600);
  Serial.println("Arduino Snake Game Starting");
  
  Modulino.begin();
  buttons.begin();
  buttons.setLeds(true, true, true);
  
  matrix.begin();

  // Initialize snake in the left half of the screen
  initializeSnake();
  
  // Place initial food
  placeFood();
  
  // Display the initial game state
  updateDisplay();
  
  Serial.println("Ready to receive serial commands");
}

void loop() {
  // Check for button presses on Arduino
  buttons.update();

  if (buttons.isPressed(0)) {      // Button A - Move up
    setDirection(DIR_UP);
  } else if (buttons.isPressed(1)) { // Button B - Move right
    setDirection(DIR_RIGHT);
  } else if (buttons.isPressed(2)) { // Button C - Move down
    setDirection(DIR_DOWN);
  }
  
  // Check for serial input
  if (Serial.available() > 0) {
    char command = Serial.read();
    
    switch (command) {
      case 'U': // Up
      case 'u':
      case 'w':
      case 'W':
        setDirection(DIR_UP);
        break;
        
      case 'D': // Down
      case 'd':
      case 's':
      case 'S':
        setDirection(DIR_DOWN);
        break;
        
      case 'L': // Left
      case 'l':
      case 'a':
      case 'A':
        setDirection(DIR_LEFT);
        break;
        
      case 'R': // Right
      case 'r':
        setDirection(DIR_RIGHT);
        break;
        
      // Fast move command
      case 'F': // Fast
      case 'f':
        fastMove = true;
        moveInterval = FAST_SPEED;
        break;
        
      // Normal speed command
      case 'N': // Normal
      case 'n':
        fastMove = false;
        moveInterval = DEFAULT_SPEED;
        break;
        
      case 'X': // Restart game after game over
        if (gameOver) {
          resetGame();
        }
        break;
        
      default:
        break;
    }
  }
  
  // Update snake movement based on timing
  unsigned long currentTime = millis();
  if (!gameOver && (currentTime - lastMoveTime >= moveInterval)) {
    lastMoveTime = currentTime;
    
    // Update direction for next move
    currentDirection = nextDirection;
    
    // Move snake
    moveSnake();
    
    // Update display
    updateDisplay();
  }
}

void initializeSnake() {
  // Clear grid
  for (int y = 0; y < MAX_Y; y++) {
    for (int x = 0; x < MAX_X; x++) {
      grid[y][x] = 0;
    }
  }
  
  // Initialize snake in the left half of the screen, moving right
  int startX = MAX_X / 4;
  int startY = MAX_Y / 2;
  
  for (int i = 0; i < snakeLength; i++) {
    snake[i].x = startX - i;
    snake[i].y = startY;
    
    // Ensure initial position is valid
    if (snake[i].x < 0) {
      snake[i].x += MAX_X; // Wrap around for initial positions
    }
    
    // Mark on grid
    grid[snake[i].y][snake[i].x] = 1;
  }
  
  // Set initial direction
  currentDirection = DIR_RIGHT;
  nextDirection = DIR_RIGHT;
}

void placeFood() {
  int attempts = 0;
  bool validPosition = false;
  
  // Find an empty spot for food
  while (!validPosition && attempts < 100) {
    foodX = random(0, MAX_X);
    foodY = random(0, MAX_Y);
    
    // Check if the spot is empty
    if (grid[foodY][foodX] == 0) {
      validPosition = true;
      grid[foodY][foodX] = 2; // Mark as food
      
      Serial.print("Food placed at: (");
      Serial.print(foodX);
      Serial.print(", ");
      Serial.print(foodY);
      Serial.println(")");
    }
    
    attempts++;
  }
  
  if (!validPosition) {
    Serial.println("WARNING: Could not place food after 100 attempts");
  }
}

void setDirection(int newDirection) {
  // Prevent 180-degree turns
  if ((currentDirection == DIR_UP && newDirection == DIR_DOWN) ||
      (currentDirection == DIR_DOWN && newDirection == DIR_UP) ||
      (currentDirection == DIR_LEFT && newDirection == DIR_RIGHT) ||
      (currentDirection == DIR_RIGHT && newDirection == DIR_LEFT)) {
    return;
  }
  
  nextDirection = newDirection;
}

void moveSnake() {
  // Calculate new head position based on current direction
  int newHeadX = snake[0].x;
  int newHeadY = snake[0].y;
  
  switch (currentDirection) {
    case DIR_UP:
      newHeadY = (newHeadY > 0) ? newHeadY - 1 : MAX_Y - 1; // Wrap around
      break;
    case DIR_DOWN:
      newHeadY = (newHeadY < MAX_Y - 1) ? newHeadY + 1 : 0; // Wrap around
      break;
    case DIR_LEFT:
      newHeadX = (newHeadX > 0) ? newHeadX - 1 : MAX_X - 1; // Wrap around
      break;
    case DIR_RIGHT:
      newHeadX = (newHeadX < MAX_X - 1) ? newHeadX + 1 : 0; // Wrap around
      break;
  }
  
  // Check if new head position hits snake body
  for (int i = 0; i < snakeLength; i++) {
    if (newHeadX == snake[i].x && newHeadY == snake[i].y) {
      gameOver = true;
      Serial.println("Game Over: Snake collided with itself");
      return;
    }
  }
  
  // Check if new head position is food
  bool ateFood = (grid[newHeadY][newHeadX] == 2);
  
  // Move snake body (shift segments backwards)
  if (!ateFood) {
    // Clear the tail position on the grid
    grid[snake[snakeLength - 1].y][snake[snakeLength - 1].x] = 0;
    
    // Move body segments
    for (int i = snakeLength - 1; i > 0; i--) {
      snake[i].x = snake[i - 1].x;
      snake[i].y = snake[i - 1].y;
    }
  } else {
    // Grow snake
    if (snakeLength < MAX_SNAKE_LENGTH) {
      snakeLength++;
      Serial.print("Snake grew! New length: ");
      Serial.println(snakeLength);
      
      // Copy last segment to new segment
      for (int i = snakeLength - 1; i > 0; i--) {
        snake[i].x = snake[i - 1].x;
        snake[i].y = snake[i - 1].y;
      }
    }
    
    // Place new food
    placeFood();
  }
  
  // Update head position
  snake[0].x = newHeadX;
  snake[0].y = newHeadY;
  grid[newHeadY][newHeadX] = 1; // Mark as snake
}

void updateDisplay() {
  // Clear the display grid first
  uint8_t displayGrid[MAX_Y][MAX_X] = {0};
  
  // Draw snake
  for (int i = 0; i < snakeLength; i++) {
    if (snake[i].x >= 0 && snake[i].x < MAX_X && snake[i].y >= 0 && snake[i].y < MAX_Y) {
      displayGrid[snake[i].y][snake[i].x] = 1;
    }
  }
  
  // Draw food
  if (!gameOver) {
    displayGrid[foodY][foodX] = 1;
  }
  
  // If game is over, make the snake blink
  if (gameOver && (millis() / 500) % 2 == 0) {
    // Clear display during blink
    for (int y = 0; y < MAX_Y; y++) {
      for (int x = 0; x < MAX_X; x++) {
        displayGrid[y][x] = 0;
      }
    }
  }
  
  // Display the grid on the LED matrix
  matrix.renderBitmap(displayGrid, MAX_Y, MAX_X);
}

void resetGame() {
  // Reset game state
  snakeLength = INITIAL_SNAKE_LENGTH;
  gameOver = false;
  moveInterval = DEFAULT_SPEED;
  fastMove = false;
  
  // Initialize snake and food
  initializeSnake();
  placeFood();
  
  // Display the game
  updateDisplay();
  
  Serial.println("Game Reset");
}

void printGameState() {
  Serial.print("Snake head: (");
  Serial.print(snake[0].x);
  Serial.print(", ");
  Serial.print(snake[0].y);
  Serial.print(") Length: ");
  Serial.print(snakeLength);
  Serial.print(" Dir: ");
  
  switch (currentDirection) {
    case DIR_UP: Serial.println("UP"); break;
    case DIR_RIGHT: Serial.println("RIGHT"); break;
    case DIR_DOWN: Serial.println("DOWN"); break;
    case DIR_LEFT: Serial.println("LEFT"); break;
  }
}
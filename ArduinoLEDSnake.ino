#include "Arduino_LED_Matrix.h" // Include the LED_Matrix library
#include "Modulino.h" // Include the Modulino library

// Grid dimensions
#define MAX_X 12
#define MAX_Y 8

// Game parameters
#define INITIAL_SNAKE_LENGTH 3
#define DEFAULT_SPEED 250 // milliseconds between moves (4 per second)
#define FOOD_TO_LEVEL_UP 5 // Food items needed to increase speed (5 items)
#define FAST_SPEED_MULTIPLIER 0.5 // 50% faster when holding down buttons

// Direction constants
#define DIR_UP 0
#define DIR_RIGHT 1
#define DIR_DOWN 2
#define DIR_LEFT 3

// Speed levels
#define MAX_SPEED_LEVEL 8
#define SPEED_INCREMENT 25 // ms per level (lower = faster)
int currentLevel = 1;
int foodEaten = 0;
int totalScore = 0;
bool speedBoostActive = false;

// Function declarations
void decreaseLevel();
void increaseLevel();
void updateMoveInterval();
void updateLevelDisplay();


// Buzzer tones for food and game over
#define FOOD_TONE 1000    // Hz
#define FOOD_DURATION 50  // ms

// Game over tones
#define GAME_OVER_TONE_1 988  // B5
#define GAME_OVER_TONE_2 784  // G5
#define GAME_OVER_TONE_3 659  // E5
#define GAME_OVER_DURATION 150 // ms

// Initialize objects
ArduinoLEDMatrix matrix;
ModulinoButtons buttons;
ModulinoPixels pixels;
ModulinoBuzzer buzzer;

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

// Game timing and state
unsigned long lastMoveTime = 0;
unsigned long moveInterval = DEFAULT_SPEED;
bool gameOver = false;

void setup() {
  // Initialize serial for debugging
  Serial.begin(9600);
  
  // Initialize all Modulino components
  Modulino.begin();
  
  // Initialize buttons - all LEDs OFF initially
  buttons.begin();
  buttons.setLeds(false, false, false);
  
  // Initialize pixels
  pixels.begin();
  updateLevelDisplay();
  
  // Initialize buzzer
  buzzer.begin();
  
  // Initialize LED matrix
  matrix.begin();
  
  // Initialize the game
  resetGame();
  
  // Print game instructions
  printInstructions();
}

void printInstructions() {
  Serial.println("===========================================");
  Serial.println("  Arduino Uno R4 - Snake Game over Web Serial");
  Serial.println("===========================================");
  Serial.println("Controls:");
  Serial.println("- Button A / W / Up Arrow: Move Up");
  Serial.println("- Button B / D / Right Arrow: Move Right");
  Serial.println("- Button C / S / Down Arrow: Move Down");
  Serial.println("- A / Left Arrow: Move Left");
  Serial.println("- Hold any direction for speed boost!");
  Serial.println("- Any A/B X/Y button to restart after game over");
  Serial.println("- Default D-Pad/Left Stick also works for movement");
  Serial.println("===========================================");
  Serial.println("Game Rules:");
  Serial.println("- Eat food to grow and earn points");
  Serial.println("- Every 5 food items increases the level/speed");
  Serial.println("- Green LEDs show current level (1-8)");
  Serial.println("- Don't crash into yourself!");
  Serial.println("===========================================");
  Serial.println("Game Starting...");
  Serial.println("");
}

void loop() {
  // Get current time once for optimization
  unsigned long currentTime = millis();
  
// Handle button presses
if (buttons.update()) {
  // Button states
  bool buttonAPressed = buttons.isPressed(0);
  bool buttonBPressed = buttons.isPressed(1);
  bool buttonCPressed = buttons.isPressed(2);
  
  // Update button LEDs to match press state
  buttons.setLeds(buttonAPressed, buttonBPressed, buttonCPressed);
  
  // Button A (press) - decrease speed level
  static bool buttonALastState = false;
  if (buttonAPressed && !buttonALastState) {
    decreaseLevel();
    Serial.println("Button A pressed - Level decreased");
  }
  buttonALastState = buttonAPressed;
  
  // Button C (press) - increase speed level
  static bool buttonCLastState = false;
  if (buttonCPressed && !buttonCLastState) {
    increaseLevel();
    Serial.println("Button C pressed - Level increased");
  }
  buttonCLastState = buttonCPressed;
  

case '+': // Increase level
  increaseLevel();
  break;
  
case '-': // Decrease level
  decreaseLevel();
  break;


  // Button B does nothing for now (future: pause)
  // static bool buttonBLastState = false;
  // buttonBLastState = buttonBPressed;
    
    // Game restart (any button press during game over)
    if (gameOver && (buttons.isPressed(0) || buttons.isPressed(1) || buttons.isPressed(2))) {
      resetGame();
    }
  }
  
  // Process serial commands
  while (Serial.available() > 0) {
    char command = Serial.read();
    processCommand(command);
  }
  
  // Calculate actual move interval including speed boost if active
  unsigned long actualMoveInterval = moveInterval;
  if (speedBoostActive) {
    actualMoveInterval = moveInterval * FAST_SPEED_MULTIPLIER;
  }
  
  // Update snake movement based on timing
  if (!gameOver && (currentTime - lastMoveTime >= actualMoveInterval)) {
    lastMoveTime = currentTime;
    
    // Update direction for next move
    currentDirection = nextDirection;
    
    // Move snake
    moveSnake();
    
    // Update display
    updateDisplay();
  }
  
  // Update display for animations even when not moving
  static unsigned long lastAnimationTime = 0;
  if ((gameOver || true) && (currentTime - lastAnimationTime >= 150)) { // Always update for food blinking
    lastAnimationTime = currentTime;
    updateDisplay();
  }
}

// Process input commands
void processCommand(char command) {
  switch (command) {
    case 'U': // Up
    case 'u':
    case 'w':
    case 'W':
      setDirection(DIR_UP);
      speedBoostActive = true; // Activate speed boost when key held
      break;
      
    case 'D': // Down
    case 'd':
    case 's':
    case 'S':
      setDirection(DIR_DOWN);
      speedBoostActive = true; // Activate speed boost when key held
      break;
      
    case 'L': // Left
    case 'l':
    case 'a':
    case 'A':
      setDirection(DIR_LEFT);
      speedBoostActive = true; // Activate speed boost when key held
      break;
      
    case 'R': // Right
    case 'r':
      setDirection(DIR_RIGHT);
      speedBoostActive = true; // Activate speed boost when key held
      break;
      
    case 'N': // Normal speed
    case 'n':
      speedBoostActive = false;
      break;
      
    case 'X': // Restart game after game over
    case 'x':
    case 'Y': // Additional restart keys
    case 'y':
    case 'B': // Any game controller button
    case 'b':
      if (gameOver) {
        resetGame();
      }
      break;
  }
}

// Set snake direction (prevents 180-degree turns)
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

// Increase speed level when eating enough food
void checkLevelUp() {
  if (foodEaten >= FOOD_TO_LEVEL_UP && currentLevel < MAX_SPEED_LEVEL) {
    currentLevel++;
    foodEaten = 0; // Reset food counter
    updateMoveInterval();
    updateLevelDisplay();
    
    // Extra feedback for level up
    buzzer.tone(FOOD_TONE * 2, FOOD_DURATION * 2);
    Serial.print("LEVEL_UP:");
    Serial.println(currentLevel);
  }
}

// Update move interval based on level
void updateMoveInterval() {
  // Base speed is 250ms, each level reduces by SPEED_INCREMENT
  moveInterval = DEFAULT_SPEED - ((currentLevel - 1) * SPEED_INCREMENT);
  
  // Ensure minimum speed isn't too fast
  if (moveInterval < 50) {
    moveInterval = 50; // Minimum 50ms between moves (20fps)
  }
  
  Serial.print("SPEED:");
  Serial.print(currentLevel);
  Serial.print(",");
  Serial.print(moveInterval);
  Serial.println("ms");
}

// Update level display on Modulino pixels
void updateLevelDisplay() {
  pixels.clear();
  
  // Set LEDs based on current level, green color with 5% brightness
  for (int i = 0; i < currentLevel; i++) {
    pixels.set(i, RED, 5);
  }
  
  pixels.show();
}

// Move the snake
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
  for (int i = 1; i < snakeLength; i++) {
    if (newHeadX == snake[i].x && newHeadY == snake[i].y) {
      gameOver = true;
      playGameOverSound();
      Serial.println("GAME_OVER:Snake collision");
      Serial.print("FINAL_SCORE:");
      Serial.println(totalScore);
      return;
    }
  }
  
  // Check if new head position is food
  bool ateFood = (newHeadX == foodX && newHeadY == foodY);
  
  // Move snake body (shift segments backwards)
  for (int i = snakeLength - 1; i > 0; i--) {
    snake[i].x = snake[i - 1].x;
    snake[i].y = snake[i - 1].y;
  }
  
  // Update head position
  snake[0].x = newHeadX;
  snake[0].y = newHeadY;
  
  // If food was eaten, grow snake and place new food
  if (ateFood) {
    playFoodSound();
    
    if (snakeLength < MAX_SNAKE_LENGTH) {
      snakeLength++;
      foodEaten++;
      totalScore++; // Increment total score
      
      // Send score to serial for browser console
      Serial.print("SCORE:");
      Serial.println(totalScore);
      Serial.print("FOOD:");
      Serial.print(foodEaten);
      Serial.print("/");
      Serial.println(FOOD_TO_LEVEL_UP);
      
      // Check if we should level up
      checkLevelUp();
    }
    
    placeFood();
  }
}

// Increase speed level
void increaseLevel() {
  if (currentLevel < MAX_SPEED_LEVEL) {
    currentLevel++;
    updateMoveInterval();
    updateLevelDisplay();
    Serial.print("LEVEL_UP:");
    Serial.println(currentLevel);
  }
}

// Decrease speed level
void decreaseLevel() {
  if (currentLevel > 1) {
    currentLevel--;
    updateMoveInterval();
    updateLevelDisplay();
    Serial.print("LEVEL_DOWN:");
    Serial.println(currentLevel);
  }
}

void placeFood() {
  // Find all empty cells first
  bool grid[MAX_Y][MAX_X] = {false}; // false = empty, true = occupied
  int emptyCount = MAX_X * MAX_Y;
  
  // Mark all cells occupied by snake
  for (int i = 0; i < snakeLength; i++) {
    if (snake[i].x >= 0 && snake[i].x < MAX_X && snake[i].y >= 0 && snake[i].y < MAX_Y) {
      grid[snake[i].y][snake[i].x] = true;
      emptyCount--;
    }
  }
  
  // If no empty cells, just return (game board is full)
  if (emptyCount <= 0) return;
  
  // Pick a random empty cell index
  int randomEmptyIndex = random(0, emptyCount);
  
  // Find that empty cell
  int currentEmptyIndex = 0;
  for (int y = 0; y < MAX_Y; y++) {
    for (int x = 0; x < MAX_X; x++) {
      if (!grid[y][x]) { // If cell is empty
        if (currentEmptyIndex == randomEmptyIndex) {
          // Found our random empty cell
          foodX = x;
          foodY = y;
          return;
        }
        currentEmptyIndex++;
      }
    }
  }
}

// Update the LED matrix display
void updateDisplay() {
  // Clear the display grid
  uint8_t displayGrid[MAX_Y][MAX_X] = {0};
  
  if (gameOver) {
    // Game over display - blink snake
    bool showSnake = (millis() / 500) % 2 == 0;
    
    if (showSnake) {
      // Draw snake
      for (int i = 0; i < snakeLength; i++) {
        displayGrid[snake[i].y][snake[i].x] = 1;
      }
      
      // Draw border to indicate game over
      for (int x = 0; x < MAX_X; x++) {
        displayGrid[0][x] = 1;            // Top border
        displayGrid[MAX_Y-1][x] = 1;      // Bottom border
      }
      for (int y = 0; y < MAX_Y; y++) {
        displayGrid[y][0] = 1;            // Left border
        displayGrid[y][MAX_X-1] = 1;      // Right border
      }
    } else {
      // Always show head during blink off state
      displayGrid[snake[0].y][snake[0].x] = 1;
    }
  } else {
    // Normal gameplay
    
    // Draw snake
    for (int i = 0; i < snakeLength; i++) {
      displayGrid[snake[i].y][snake[i].x] = 1;
    }
    
    // Draw food (blinking)
    if ((millis() / 200) % 2 == 0) { // Blink the food every 200ms
      displayGrid[foodY][foodX] = 1;
    }
  }
  
  // Display the grid on the LED matrix
  matrix.renderBitmap(displayGrid, MAX_Y, MAX_X);
}

// Play sound when food is eaten
void playFoodSound() {
  buzzer.tone(FOOD_TONE, FOOD_DURATION);
}

// Play descending tones for game over
void playGameOverSound() {
  buzzer.tone(GAME_OVER_TONE_1, GAME_OVER_DURATION);
  delay(GAME_OVER_DURATION);
  buzzer.tone(GAME_OVER_TONE_2, GAME_OVER_DURATION);
  delay(GAME_OVER_DURATION);
  buzzer.tone(GAME_OVER_TONE_3, GAME_OVER_DURATION);
}

// Reset the game
void resetGame() {
  // Reset game state
  gameOver = false;
  snakeLength = INITIAL_SNAKE_LENGTH;
  currentDirection = DIR_RIGHT;
  nextDirection = DIR_RIGHT;
  
  // Reset level and counters
  currentLevel = 1;
  foodEaten = 0;
  totalScore = 0;
  speedBoostActive = false;
  
  updateMoveInterval();
  updateLevelDisplay();
  
  // Turn off all button LEDs
  buttons.setLeds(false, false, false);
  
  // Initialize snake in the left half of the screen
  for (int i = 0; i < snakeLength; i++) {
    snake[i].x = (MAX_X / 4) - i;
    snake[i].y = MAX_Y / 2;
    
    // Ensure initial position is valid (wrap around if needed)
    if (snake[i].x < 0) {
      snake[i].x += MAX_X;
    }
  }
  
  // Place initial food
  placeFood();
  
  // Update display
  updateDisplay();
  
  // Log game reset
  Serial.println("GAME_RESET");
}
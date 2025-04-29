#include "Arduino_LED_Matrix.h" // Include the LED_Matrix library
#include "Modulino.h" // Include the Modulino library

// Grid dimensions
#define MAX_Y 8
#define MAX_X 12

// Initialize the LED matrix object
ArduinoLEDMatrix matrix;
ModulinoButtons buttons;

// Game state. 0 is off, 1 is on
uint8_t grid[MAX_Y][MAX_X] = {0}; // Initialize all to off

int currentX = 0;
int currentY = 0;

void setup() {
  Serial.begin(9600);
  Serial.println("Arduino Serial Control Starting");
  
  Modulino.begin();
  buttons.begin();
  buttons.setLeds(true, true, true);
  
  matrix.begin();

  // Place a single dot at a random position
  placeRandomDot();

  // Display the grid
  displayGrid();
  
  Serial.println("Ready to receive serial commands");
}

void loop() {
  // Check for button presses on Arduino
  buttons.update();

  if (buttons.isPressed(0)) {      // Button A - Move up
    moveUp();
  } else if (buttons.isPressed(1)) { // Button B - Move right
    moveRight();
  } else if (buttons.isPressed(2)) { // Button C - Move down
    moveDown();
  }
  
  // Check for serial input
  if (Serial.available() > 0) {
    char command = Serial.read();
    Serial.print("Received command: ");
    Serial.println(command);
    
    switch (command) {
      case 'U': // Up
      case 'u':
      case 'w':
      case 'W':
        moveUp();
        Serial.println("Moving UP");
        break;
        
      case 'D': // Down
      case 'd':
      case 's':
      case 'S':
        moveDown();
        Serial.println("Moving DOWN");
        break;
        
      case 'L': // Left
      case 'l':
      case 'a':
      case 'A':
        moveLeft();
        Serial.println("Moving LEFT");
        break;
        
      case 'R': // Right
      case 'r':
        moveRight();
        Serial.println("Moving RIGHT");
        break;
        
      default:
        Serial.print("Unknown command: ");
        Serial.println(command);
        break;
    }
  }
}

// Game functions
void placeRandomDot() {
  // Generate random coordinates for the dot
  currentX = random(0, MAX_X);
  currentY = random(0, MAX_Y);

  // Set the corresponding position to 1 (on)
  grid[currentY][currentX] = 1;

  // Print current position and LED number for debugging
  printDotPosition();
}

void printDotPosition() {
  Serial.print("Dot position: (");
  Serial.print(currentX + 1); // Convert to 1-based index
  Serial.print(", ");
  Serial.print(currentY + 1); // Convert to 1-based index
  Serial.print(") LED number: ");

  // Calculate LED number based on (x, y) position
  int ledNumber = (currentY * MAX_X) + currentX + 1;
  Serial.println(ledNumber);
}

void displayGrid() {
  // Display the grid on the LED matrix
  matrix.renderBitmap(grid, MAX_Y, MAX_X);
}

void moveUp() {
  // Clear the previous dot position
  grid[currentY][currentX] = 0;

  // Move the dot up by 1 row, with wrap-around
  currentY = (currentY > 0) ? currentY - 1 : MAX_Y - 1;

  // Set the new dot position
  grid[currentY][currentX] = 1;

  // Display the updated grid
  displayGrid();

  // Print the new dot position
  printDotPosition();
}

void moveDown() {
  // Clear the previous dot position
  grid[currentY][currentX] = 0;

  // Move the dot down by 1 row, with wrap-around
  currentY = (currentY < MAX_Y - 1) ? currentY + 1 : 0;

  // Set the new dot position
  grid[currentY][currentX] = 1;

  // Display the updated grid
  displayGrid();

  // Print the new dot position
  printDotPosition();
}

void moveRight() {
  // Clear the previous dot position
  grid[currentY][currentX] = 0;

  // Move the dot right by 1 column, with wrap-around
  currentX = (currentX < MAX_X - 1) ? currentX + 1 : 0;

  // Set the new dot position
  grid[currentY][currentX] = 1;

  // Display the updated grid
  displayGrid();

  // Print the new dot position
  printDotPosition();
}

void moveLeft() {
  // Clear the previous dot position
  grid[currentY][currentX] = 0;

  // Move the dot left by 1 column, with wrap-around
  currentX = (currentX > 0) ? currentX - 1 : MAX_X - 1;

  // Set the new dot position
  grid[currentY][currentX] = 1;

  // Display the updated grid
  displayGrid();

  // Print the new dot position
  printDotPosition();
}
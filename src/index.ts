import {BehaviorSubject, combineLatest, fromEvent, interval, merge, Observable, of} from 'rxjs';
import {animationFrame} from 'rxjs/internal/scheduler/animationFrame';
import {
  distinctUntilChanged,
  filter,
  map, mergeMap,
  scan,
  share,
  skip,
  startWith,
  switchMap,
  takeWhile,
  tap,
  withLatestFrom
} from 'rxjs/operators';

import {renderGameOver, renderScene} from './canvas';
import {POINTS_PER_APPLE, SNAKE_LENGTH} from './constants';

import {eat, generateApples, generateSnake, incrementSnakeSpeed, isGameOver, move, nextDirection} from './game.util';
import './style.css';
import {Directions, Point2D} from './types';

/**
 * Create canvas element and append it to the page
 */
const gameArea: HTMLElement = document.getElementById('game');
const ctx: CanvasRenderingContext2D = (<HTMLCanvasElement>gameArea).getContext('2d');

/**
 * Starting values
 */
let PAUSE = false;
let SPEED = 150;
const FPS = 60;

const DIRECTIONS: Directions = {
  'ArrowLeft': {x: -1, y: 0},
  'ArrowRight': {x: 1, y: 0},
  'ArrowUp': {x: 0, y: -1},
  'ArrowDown': {x: 0, y: 1}
};

const DIRECTIONS_BUTTON: Directions = {
  'left': {x: -1, y: 0},
  'right': {x: 1, y: 0},
  'up': {x: 0, y: -1},
  'down': {x: 0, y: 1}
};

let INITIAL_DIRECTION = DIRECTIONS['ArrowDown'];

/**
 * Determines the speed of the snake
 */
let speedSubject = new BehaviorSubject(SPEED);
let ticks$ = speedSubject.pipe(
  switchMap(v => interval(v))
);

/**
 * Track some general user interactions with the document
 */
let click$ = fromEvent(document, 'click');
let keydown$ = fromEvent(document, 'keydown');

/**
 * Pause the game
 */
let pause$ = keydown$.pipe(
  filter((event: KeyboardEvent) => event.key === ' '),
  map(() => {
    PAUSE = !PAUSE;
    return PAUSE;
  }),
  startWith(PAUSE),
  distinctUntilChanged()
);

/**
 * Change direction of the snake based on the latest arrow keypress by the user
 */
let direction$ = merge(keydown$, click$).pipe(
  map((event: KeyboardEvent | MouseEvent) => {
    if(event instanceof  KeyboardEvent) {
      return DIRECTIONS[event.key];
    } else if (event instanceof MouseEvent) {
      if(event.srcElement.id) {
        return DIRECTIONS_BUTTON[event.srcElement.id]
      }
    }
  }),
  filter(direction => !!direction),
  scan(nextDirection),
  startWith(INITIAL_DIRECTION),
  distinctUntilChanged()
);

/**
 * Broadcasting mechanism used to notify subscribers of collisions
 * between the snake and the apples
 */
let length$ = new BehaviorSubject<number>(SNAKE_LENGTH);

/**
 * Accumulates the length of the snake (number of body segments)
 */
let snakeLength$ = length$.pipe(
  scan((step, snakeLength) => snakeLength + step),
  share()
);

/**
 * Player's score
 */
let score$ = snakeLength$.pipe(
  startWith(0),
  scan((score, _) => score + POINTS_PER_APPLE)
);

/**
 * Accumulates an array of body segments. Each segment is represented
 * as a cell on the grid
 */
let snake$: Observable<Array<Point2D>> = ticks$.pipe(
  withLatestFrom(direction$, snakeLength$, pause$, (_, direction, snakeLength, pause) => [direction, snakeLength, pause]),
  scan(move, generateSnake()),
  share()
);

/**
 * List of apples
 */
let apples$ = snake$.pipe(
  scan(eat, generateApples()),
  distinctUntilChanged(),
  share()
);

/**
 * Used to broadcast collisions to update the score and add a new
 * body segment to the snake
 */
let appleEaten$ = apples$.pipe(
  skip(1),
  tap(() => {
    SPEED = incrementSnakeSpeed(SPEED);
    speedSubject.next(SPEED);
    length$.next(POINTS_PER_APPLE);
  })
).subscribe();

/**
 * Core game logic which returns an Observable of the scene. This will be
 * used to render the game to the canvas as it unfolds
 */
let scene$ = combineLatest(snake$, apples$, score$)
  .pipe(
    map(([snake, apples, score]) => {
      return {snake, apples, score};
    })
  );

/**
 * This stream takes care of rendering the game while maintaining 60 FPS
 */
let game$ = interval(1000 / FPS, animationFrame).pipe(
  withLatestFrom(scene$, (_, scene) => scene),
  takeWhile(scene => !isGameOver(scene))
).subscribe({
  next: (scene) => renderScene(ctx, scene),
  complete: () => renderGameOver(ctx)
});
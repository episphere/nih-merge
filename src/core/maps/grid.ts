// Gridette — lightweight CSS Grid layout manager with drag-and-drop cell swapping.
// Ported from planning/old_files/Gridette.js

// --- Types ---

export interface GridCell {
  x: number;
  y: number;
  element: HTMLDivElement;
  contentElement?: HTMLElement;
  draggable?: Draggable;
}

export interface GridetteOptions {
  nRows?: number;
  nCols?: number;
  swappable?: boolean;
  handle?: string | null;
}

export type SwapListener = (cellA: GridCell, cellB: GridCell) => void;

// --- Rect with cell coordinates (used during drag) ---

interface CellRect {
  x: number;
  left: number;
  right: number;
  width: number;
  y: number;
  top: number;
  bottom: number;
  height: number;
  _cellX: number;
  _cellY: number;
}

interface Intersection {
  index: number;
  overlap: number;
}

// --- Gridette ---

export class Gridette {
  nRows: number;
  nCols: number;
  swappable: boolean;
  handle: string | null;
  gridElement: HTMLDivElement;
  cellMatrix: (GridCell | undefined)[][];

  #listeners: { swap: SwapListener[] };
  #draggableElements: WeakMap<HTMLElement, Draggable>;

  constructor(containerElement: HTMLElement, options: GridetteOptions = {}) {
    const opts: Required<GridetteOptions> = {
      nRows: 1,
      nCols: 1,
      swappable: true,
      handle: null,
      ...options,
    };

    this.nRows = opts.nRows;
    this.nCols = opts.nCols;
    this.swappable = opts.swappable;
    this.handle = opts.handle;

    containerElement.innerHTML = '';
    this.gridElement = document.createElement('div');
    this.gridElement.className = 'gridette';
    containerElement.appendChild(this.gridElement);

    this.#listeners = { swap: [] };
    this.#draggableElements = new WeakMap();

    this.cellMatrix = [];
    for (let y = 1; y <= this.nRows; y++) {
      const row: (GridCell | undefined)[] = new Array(this.nCols);
      this.cellMatrix.push(row);
      for (let x = 1; x <= this.nCols; x++) {
        this.#createAndAddCell(x, y);
      }
    }

    this.#updateGrid();
  }

  setCell(element: HTMLElement, x: number, y: number): void {
    if (x > this.nCols || y > this.nRows) {
      throw new Error(
        `Attempted to add cell to (${x}, ${y}), exceeds grid size (${this.nRows} x ${this.nCols})`,
      );
    }
    if (x === 0 || y === 0) {
      throw new Error(`Attempted to add cell to (${x}, ${y}), grid is indexed from 1`);
    }

    const cell = this.#createAndAddCell(x, y);
    cell.element.appendChild(element);
    cell.contentElement = element;

    if (this.swappable) {
      this.#addSwappingLogic(cell);
    }
  }

  on(eventName: 'swap', listener: SwapListener): void {
    const listeners = this.#listeners[eventName];
    if (listeners) {
      listeners.push(listener);
    }
  }

  addRow(): void {
    this.nRows++;

    const row: (GridCell | undefined)[] = new Array(this.nCols);
    this.cellMatrix.push(row);

    for (let x = 1; x <= this.nCols; x++) {
      this.#createAndAddCell(x, this.nRows);
    }

    this.#updateGrid();
  }

  addColumn(): void {
    this.nCols++;
    this.cellMatrix.forEach((_row, y) => this.#createAndAddCell(this.nCols, y + 1));
    this.#updateGrid();
  }

  removeRow(y?: number): void {
    if (y === undefined) {
      y = this.nRows;
    }

    if (y > this.nRows) {
      throw new Error(`Attempted to remove row ${y}, exceeds max row ${this.nRows}`);
    }
    if (y === 0) {
      throw new Error(`Attempted to remove row ${y}, grid is indexed from 1`);
    }

    this.cellMatrix[y - 1].forEach((cell) => {
      if (cell) {
        cell.element.remove();
      }
    });
    for (let i = y - 1; i < this.nRows - 1; i++) {
      this.cellMatrix[i] = this.cellMatrix[i + 1];
    }
    this.cellMatrix.length--;
    this.nRows--;

    this.#updateGrid();
  }

  removeCol(x?: number): void {
    if (x === undefined) {
      x = this.nCols;
    }

    if (x > this.nCols) {
      throw new Error(`Attempted to remove column ${x}, exceeds max column ${this.nCols}`);
    }
    if (x === 0) {
      throw new Error(`Attempted to remove column ${x}, grid is indexed from 1`);
    }

    for (let i = 0; i < this.nRows; i++) {
      const cell = this.cellMatrix[i][x - 1];
      if (cell) {
        cell.element.remove();
      }
      for (let j = x - 1; j < this.nCols - 1; j++) {
        this.cellMatrix[i][j] = this.cellMatrix[i][j + 1];
      }
      this.cellMatrix[i].length--;
    }
    this.nCols--;

    this.#updateGrid();
  }

  setGridSize(nRows: number, nCols: number): void {
    const rowDiff = nRows - this.nRows;
    if (rowDiff > 0) {
      for (let i = 0; i < rowDiff; i++) this.addRow();
    } else if (rowDiff < 0) {
      for (let i = 0; i < Math.abs(rowDiff); i++) this.removeRow();
    }

    const colDiff = nCols - this.nCols;
    if (colDiff > 0) {
      for (let i = 0; i < colDiff; i++) this.addColumn();
    } else if (colDiff < 0) {
      for (let i = 0; i < Math.abs(colDiff); i++) this.removeCol();
    }
  }

  getCell(x: number, y: number): GridCell | undefined {
    return this.cellMatrix[y - 1]?.[x - 1];
  }

  #addSwappingLogic(cell: GridCell): void {
    const previousDraggable = this.#draggableElements.get(cell.element);
    if (previousDraggable) {
      previousDraggable.detach();
    }

    const draggable = new Draggable(cell.element, { handle: this.handle });
    this.#draggableElements.set(cell.element, draggable);
    cell.draggable = draggable;

    let rects: CellRect[] = [];
    draggable.onDragStart = () => {
      rects = [];
      for (let i = 0; i < this.nRows; i++) {
        for (let j = 0; j < this.nCols; j++) {
          const cx = j + 1;
          const cy = i + 1;
          if (cx !== cell.x || cy !== cell.y) {
            const domRect = this.cellMatrix[i][j]!.element.getBoundingClientRect();
            rects.push({
              x: domRect.x,
              left: domRect.left,
              right: domRect.right,
              width: domRect.width,
              y: domRect.y,
              top: domRect.top,
              bottom: domRect.bottom,
              height: domRect.height,
              _cellX: cx,
              _cellY: cy,
            });
          }
        }
      }
      cell.element.classList.add('gridette-cell-dragging-from');
    };

    let possibleSwapCell: GridCell | null = null;
    draggable.onDrag = (rect) => {
      const intersections = checkIntersections(rect, rects).filter((d) => d.overlap >= 0.3);
      intersections.sort((a, b) => b.overlap - a.overlap);
      const intersection = intersections[0];
      if (intersection) {
        const otherRect = rects[intersection.index];

        const futurePossibleSwapCell = this.cellMatrix[otherRect._cellY - 1][otherRect._cellX - 1]!;
        if (possibleSwapCell !== futurePossibleSwapCell) {
          if (possibleSwapCell) {
            possibleSwapCell.element.style.gridRow = String(possibleSwapCell.y);
            possibleSwapCell.element.style.gridColumn = String(possibleSwapCell.x);
          }

          possibleSwapCell = futurePossibleSwapCell;
          possibleSwapCell.element.style.gridRow = String(cell.y);
          possibleSwapCell.element.style.gridColumn = String(cell.x);
          cell.element.style.gridRow = String(otherRect._cellY);
          cell.element.style.gridColumn = String(otherRect._cellX);
        }
      } else {
        if (possibleSwapCell) {
          cell.element.style.gridRow = String(cell.y);
          cell.element.style.gridColumn = String(cell.x);
          possibleSwapCell.element.style.gridRow = String(possibleSwapCell.y);
          possibleSwapCell.element.style.gridColumn = String(possibleSwapCell.x);
          possibleSwapCell = null;
        }
      }
    };

    draggable.onDrop = () => {
      cell.element.classList.remove('gridette-cell-dragging-from');

      // Complete the swap
      if (possibleSwapCell) {
        const { x, y } = cell;
        cell.x = possibleSwapCell.x;
        cell.y = possibleSwapCell.y;
        possibleSwapCell.x = x;
        possibleSwapCell.y = y;
        this.cellMatrix[cell.y - 1][cell.x - 1] = cell;
        this.cellMatrix[possibleSwapCell.y - 1][possibleSwapCell.x - 1] = possibleSwapCell;
        this.#listeners.swap.forEach((f) => f(possibleSwapCell!, cell));
        possibleSwapCell = null;
      }
    };

    cell.element.setAttribute('gridette-swappable', '');
  }

  #createAndAddCell(x: number, y: number): GridCell {
    let cellElement = this.cellMatrix[y - 1]?.[x - 1]?.element;
    if (cellElement) {
      cellElement.replaceChildren();
    } else {
      cellElement = document.createElement('div');
      cellElement.className = 'gridette-cell';
      cellElement.style.gridRow = String(y);
      cellElement.style.gridColumn = String(x);
      this.gridElement.appendChild(cellElement);
    }

    const cell: GridCell = { x, y, element: cellElement };
    this.cellMatrix[y - 1][x - 1] = cell;
    return cell;
  }

  #updateGrid(): void {
    this.gridElement.style.gridTemplateRows = `repeat(${this.nRows}, minmax(0, 1fr))`;
    this.gridElement.style.gridTemplateColumns = `repeat(${this.nCols}, minmax(0, 1fr))`;
  }
}

// --- Draggable (internal) ---

interface DraggableOptions {
  handle?: string | null;
}

interface DragRect {
  x: number;
  left: number;
  right: number;
  width: number;
  y: number;
  top: number;
  bottom: number;
  height: number;
}

class Draggable {
  element: HTMLElement;
  handle: string | null;
  handleElement: HTMLElement | null = null;
  onDragStart: () => void = () => {};
  onDrag: (rect: DragRect) => void = () => {};
  onDrop: (rect: DOMRect | null) => void = () => {};

  #handleDragStart: ((e: MouseEvent) => void) | null = null;

  constructor(element: HTMLElement, options: DraggableOptions = {}) {
    this.element = element;
    this.handle = options.handle ?? null;
    this.#makeDraggable();
  }

  #makeDraggable(): void {
    if (this.handle) {
      this.handleElement = this.element.querySelector(this.handle);
    } else {
      this.handleElement = this.element;
    }

    if (!this.handleElement) return;

    let dragClone: HTMLElement | null = null;
    let offset = { x: 0, y: 0 };
    let dragBbox: DragRect | null = null;
    let lastMousePos = { x: 0, y: 0 };

    const handleMove = (e: MouseEvent): void => {
      requestAnimationFrame(() => {
        if (dragClone && dragBbox) {
          dragClone.style.left = e.clientX - offset.x + 'px';
          dragClone.style.top = e.clientY - offset.y + 'px';
          const diffX = e.clientX - lastMousePos.x;
          const diffY = e.clientY - lastMousePos.y;
          lastMousePos.x = e.clientX;
          lastMousePos.y = e.clientY;
          dragBbox.left += diffX;
          dragBbox.right += diffX;
          dragBbox.x += diffX;
          dragBbox.top += diffY;
          dragBbox.bottom += diffY;
          dragBbox.y += diffY;
          this.onDrag(dragBbox);
        }
      });
    };

    const handleDrop = (): void => {
      document.removeEventListener('mousemove', handleMove);
      let cloneRect: DOMRect | null = null;
      if (dragClone) {
        cloneRect = dragClone.getBoundingClientRect();
        dragClone.remove();
      }
      dragClone = null;
      dragBbox = null;
      document.body.style.userSelect = '';
      this.onDrop(cloneRect);
    };

    this.#handleDragStart = (e: MouseEvent): void => {
      dragClone = this.element.cloneNode(true) as HTMLElement;
      const bbox = this.element.getBoundingClientRect();
      dragClone.style.position = 'fixed';
      dragClone.style.width = bbox.width + 'px';
      dragClone.style.height = bbox.height + 'px';
      dragClone.style.zIndex = '1000';

      dragBbox = {
        x: bbox.x,
        left: bbox.left,
        right: bbox.right,
        width: bbox.width,
        y: bbox.y,
        top: bbox.top,
        bottom: bbox.bottom,
        height: bbox.height,
      };
      offset = { x: e.clientX - dragBbox.x, y: e.clientY - dragBbox.y };
      lastMousePos = { x: e.clientX, y: e.clientY };

      dragClone.style.left = e.clientX - offset.x + 'px';
      dragClone.style.top = e.clientY - offset.y + 'px';

      document.body.appendChild(dragClone);

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleDrop, { once: true });

      document.body.style.userSelect = 'none';
      this.onDragStart();
    };

    this.handleElement.addEventListener('mousedown', this.#handleDragStart);
  }

  detach(): void {
    if (this.handleElement && this.#handleDragStart) {
      this.handleElement.removeEventListener('mousedown', this.#handleDragStart);
    }
  }
}

// --- Intersection detection (internal) ---

function checkIntersections(rect: DragRect, rects: CellRect[]): Intersection[] {
  const intersections: Intersection[] = [];
  const rectArea = rect.width * rect.height;

  if (rectArea === 0) {
    return [];
  }

  for (let i = 0; i < rects.length; i++) {
    const otherRect = rects[i];

    const intersectLeft = Math.max(rect.left, otherRect.left);
    const intersectRight = Math.min(rect.right, otherRect.right);
    const intersectTop = Math.max(rect.top, otherRect.top);
    const intersectBottom = Math.min(rect.bottom, otherRect.bottom);

    if (intersectLeft < intersectRight && intersectTop < intersectBottom) {
      const intersectWidth = intersectRight - intersectLeft;
      const intersectHeight = intersectBottom - intersectTop;
      const overlapArea = intersectWidth * intersectHeight;
      const overlapProportion = overlapArea / rectArea;

      intersections.push({
        index: i,
        overlap: overlapProportion,
      });
    }
  }

  return intersections;
}

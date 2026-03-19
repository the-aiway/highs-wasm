// Low-level cwrap bindings for HiGHS C API

export interface HighsModule {
  // Memory management
  _malloc(size: number): number;
  _free(ptr: number): void;

  // Heap access
  HEAP8: Int8Array;
  HEAPU8: Uint8Array;
  HEAP16: Int16Array;
  HEAPU16: Uint16Array;
  HEAP32: Int32Array;
  HEAPU32: Uint32Array;
  HEAPF32: Float32Array;
  HEAPF64: Float64Array;

  // Runtime methods
  cwrap: <T extends (...args: any[]) => any>(
    name: string,
    returnType: string | null,
    argTypes: string[]
  ) => T;
  getValue(ptr: number, type: string): number;
  setValue(ptr: number, value: number, type: string): void;
  stringToUTF8(str: string, outPtr: number, maxBytesToWrite: number): void;
  UTF8ToString(ptr: number): string;
  lengthBytesUTF8(str: string): number;
}

export interface HighsCApi {
  // Lifecycle
  create(): number;
  destroy(highs: number): void;
  run(highs: number): number;
  clear(highs: number): number;
  clearModel(highs: number): number;

  // Model I/O
  readModel(highs: number, filename: number): number;
  writeModel(highs: number, filename: number): number;

  // Bulk model building
  passLp(
    highs: number,
    numCol: number,
    numRow: number,
    numNz: number,
    aFormat: number,
    sense: number,
    offset: number,
    colCost: number,
    colLower: number,
    colUpper: number,
    rowLower: number,
    rowUpper: number,
    aStart: number,
    aIndex: number,
    aValue: number
  ): number;

  passMip(
    highs: number,
    numCol: number,
    numRow: number,
    numNz: number,
    aFormat: number,
    sense: number,
    offset: number,
    colCost: number,
    colLower: number,
    colUpper: number,
    rowLower: number,
    rowUpper: number,
    aStart: number,
    aIndex: number,
    aValue: number,
    integrality: number
  ): number;

  // Incremental model building
  addVar(highs: number, lower: number, upper: number): number;
  addVars(highs: number, numNewVar: number, lower: number, upper: number): number;
  addCol(
    highs: number,
    cost: number,
    lower: number,
    upper: number,
    numNewNz: number,
    index: number,
    value: number
  ): number;
  addCols(
    highs: number,
    numNewCol: number,
    costs: number,
    lower: number,
    upper: number,
    numNewNz: number,
    starts: number,
    index: number,
    value: number
  ): number;
  addRow(
    highs: number,
    lower: number,
    upper: number,
    numNewNz: number,
    index: number,
    value: number
  ): number;
  addRows(
    highs: number,
    numNewRow: number,
    lower: number,
    upper: number,
    numNewNz: number,
    starts: number,
    index: number,
    value: number
  ): number;

  // Model modification
  changeColCost(highs: number, col: number, cost: number): number;
  changeColBounds(highs: number, col: number, lower: number, upper: number): number;
  changeRowBounds(highs: number, row: number, lower: number, upper: number): number;
  changeCoeff(highs: number, row: number, col: number, value: number): number;
  changeObjectiveSense(highs: number, sense: number): number;
  changeObjectiveOffset(highs: number, offset: number): number;
  changeColIntegrality(highs: number, col: number, integrality: number): number;

  // Model info
  getNumCol(highs: number): number;
  getNumRow(highs: number): number;
  getNumNz(highs: number): number;

  // Solution access
  getObjectiveValue(highs: number): number;
  getSolution(
    highs: number,
    colValue: number,
    colDual: number,
    rowValue: number,
    rowDual: number
  ): number;
  getBasis(highs: number, colStatus: number, rowStatus: number): number;
  getModelStatus(highs: number): number;

  // Info values
  getIntInfoValue(highs: number, info: number, value: number): number;
  getDoubleInfoValue(highs: number, info: number, value: number): number;
  getInt64InfoValue(highs: number, info: number, value: number): number;
  getInfoType(highs: number, info: number, type: number): number;

  // Options
  setBoolOptionValue(highs: number, option: number, value: number): number;
  setIntOptionValue(highs: number, option: number, value: number): number;
  setDoubleOptionValue(highs: number, option: number, value: number): number;
  setStringOptionValue(highs: number, option: number, value: number): number;

  // Callbacks
  setCallback(highs: number, callback: number, userData: number): number;
  startCallback(highs: number, callbackType: number): number;
  stopCallback(highs: number, callbackType: number): number;

  // Misc
  version(): number;
  getRunTime(highs: number): number;
  passColName(highs: number, col: number, name: number): number;
  passRowName(highs: number, row: number, name: number): number;
}

export function createCApi(module: HighsModule): HighsCApi {
  const { cwrap } = module;

  return {
    // Lifecycle
    create: cwrap("Highs_create", "number", []),
    destroy: cwrap("Highs_destroy", null, ["number"]),
    run: cwrap("Highs_run", "number", ["number"]),
    clear: cwrap("Highs_clear", "number", ["number"]),
    clearModel: cwrap("Highs_clearModel", "number", ["number"]),

    // Model I/O
    readModel: cwrap("Highs_readModel", "number", ["number", "number"]),
    writeModel: cwrap("Highs_writeModel", "number", ["number", "number"]),

    // Bulk model building
    passLp: cwrap("Highs_passLp", "number", [
      "number", "number", "number", "number", "number", "number", "number",
      "number", "number", "number", "number", "number", "number", "number", "number"
    ]),
    passMip: cwrap("Highs_passMip", "number", [
      "number", "number", "number", "number", "number", "number", "number",
      "number", "number", "number", "number", "number", "number", "number", "number", "number"
    ]),

    // Incremental model building
    addVar: cwrap("Highs_addVar", "number", ["number", "number", "number"]),
    addVars: cwrap("Highs_addVars", "number", ["number", "number", "number", "number"]),
    addCol: cwrap("Highs_addCol", "number", [
      "number", "number", "number", "number", "number", "number", "number"
    ]),
    addCols: cwrap("Highs_addCols", "number", [
      "number", "number", "number", "number", "number", "number", "number", "number", "number"
    ]),
    addRow: cwrap("Highs_addRow", "number", [
      "number", "number", "number", "number", "number", "number"
    ]),
    addRows: cwrap("Highs_addRows", "number", [
      "number", "number", "number", "number", "number", "number", "number", "number"
    ]),

    // Model modification
    changeColCost: cwrap("Highs_changeColCost", "number", ["number", "number", "number"]),
    changeColBounds: cwrap("Highs_changeColBounds", "number", ["number", "number", "number", "number"]),
    changeRowBounds: cwrap("Highs_changeRowBounds", "number", ["number", "number", "number", "number"]),
    changeCoeff: cwrap("Highs_changeCoeff", "number", ["number", "number", "number", "number"]),
    changeObjectiveSense: cwrap("Highs_changeObjectiveSense", "number", ["number", "number"]),
    changeObjectiveOffset: cwrap("Highs_changeObjectiveOffset", "number", ["number", "number"]),
    changeColIntegrality: cwrap("Highs_changeColIntegrality", "number", ["number", "number", "number"]),

    // Model info
    getNumCol: cwrap("Highs_getNumCol", "number", ["number"]),
    getNumRow: cwrap("Highs_getNumRow", "number", ["number"]),
    getNumNz: cwrap("Highs_getNumNz", "number", ["number"]),

    // Solution access
    getObjectiveValue: cwrap("Highs_getObjectiveValue", "number", ["number"]),
    getSolution: cwrap("Highs_getSolution", "number", [
      "number", "number", "number", "number", "number"
    ]),
    getBasis: cwrap("Highs_getBasis", "number", ["number", "number", "number"]),
    getModelStatus: cwrap("Highs_getModelStatus", "number", ["number"]),

    // Info values
    getIntInfoValue: cwrap("Highs_getIntInfoValue", "number", ["number", "number", "number"]),
    getDoubleInfoValue: cwrap("Highs_getDoubleInfoValue", "number", ["number", "number", "number"]),
    getInt64InfoValue: cwrap("Highs_getInt64InfoValue", "number", ["number", "number", "number"]),
    getInfoType: cwrap("Highs_getInfoType", "number", ["number", "number", "number"]),

    // Options
    setBoolOptionValue: cwrap("Highs_setBoolOptionValue", "number", ["number", "number", "number"]),
    setIntOptionValue: cwrap("Highs_setIntOptionValue", "number", ["number", "number", "number"]),
    setDoubleOptionValue: cwrap("Highs_setDoubleOptionValue", "number", ["number", "number", "number"]),
    setStringOptionValue: cwrap("Highs_setStringOptionValue", "number", ["number", "number", "number"]),

    // Callbacks
    setCallback: cwrap("Highs_setCallback", "number", ["number", "number", "number"]),
    startCallback: cwrap("Highs_startCallback", "number", ["number", "number"]),
    stopCallback: cwrap("Highs_stopCallback", "number", ["number", "number"]),

    // Misc
    version: cwrap("Highs_version", "number", []),
    getRunTime: cwrap("Highs_getRunTime", "number", ["number"]),
    passColName: cwrap("Highs_passColName", "number", ["number", "number", "number"]),
    passRowName: cwrap("Highs_passRowName", "number", ["number", "number", "number"]),
  };
}

// Helper to allocate a string and return pointer
export function allocString(module: HighsModule, str: string): number {
  const len = module.lengthBytesUTF8(str) + 1;
  const ptr = module._malloc(len);
  module.stringToUTF8(str, ptr, len);
  return ptr;
}

// Helper to allocate Float64Array and return pointer
export function allocFloat64Array(module: HighsModule, arr: Float64Array | number[]): number {
  const bytes = arr.length * 8;
  const ptr = module._malloc(bytes);
  const data = arr instanceof Float64Array ? arr : new Float64Array(arr);
  module.HEAPF64.set(data, ptr / 8);
  return ptr;
}

// Helper to allocate Int32Array and return pointer
export function allocInt32Array(module: HighsModule, arr: Int32Array | number[]): number {
  const bytes = arr.length * 4;
  const ptr = module._malloc(bytes);
  const data = arr instanceof Int32Array ? arr : new Int32Array(arr);
  module.HEAP32.set(data, ptr / 4);
  return ptr;
}

// Helper to read Float64Array from heap
export function readFloat64Array(module: HighsModule, ptr: number, length: number): Float64Array {
  return module.HEAPF64.slice(ptr / 8, ptr / 8 + length);
}

// Helper to read Int32Array from heap
export function readInt32Array(module: HighsModule, ptr: number, length: number): Int32Array {
  return module.HEAP32.slice(ptr / 4, ptr / 4 + length);
}

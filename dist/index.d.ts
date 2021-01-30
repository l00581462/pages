import * as THREE from 'three';
import mitt from 'mitt';
import './index.css';
interface MaterialSegment {
    name: string;
    faceIndex: number;
}
interface D3Link {
    source: string;
    target: string;
}
interface Node {
    id: string;
    name: string;
    label: string;
    eventCount?: number;
    middleWareType?: string;
    index?: number;
    faceIndex?: number;
}
interface Link {
    id: string;
    name: string;
    label: string;
    source: string;
    target: string;
    callPerMinute?: number;
    index?: number;
}
interface GraphData {
    nodes: Array<Node>;
    links: Array<Link>;
}
interface GraphBaseConfig {
    width: number;
    height: number;
    weight?: number;
    dashSize?: number;
    dashScale?: number;
    gapSize?: number;
    nodeSize?: number;
    eventNodeSize?: number;
    arrowSize?: number;
    circleSize?: number;
    textSize?: number;
    lineWidth?: number;
    showStatTable?: boolean;
    zoomScale?: number;
    zoomNear?: number;
    zoomFar?: number;
    debug?: boolean;
}
interface D3ForceData {
    nodes: Array<{
        id: string;
    }>;
    links: Array<D3Link>;
}
interface ProcessedData extends D3ForceData {
    nodeInfoMap: {
        [key: string]: Node;
    };
    linkInfoMap: {
        [key: string]: Link;
    };
    nodeTypeRelatedData: {
        [key: string]: {
            eventNodes: Array<MaterialSegment>;
            callPerMinuteNums: Array<MaterialSegment>;
            lines: Array<MaterialSegment>;
        };
    };
    linkBuffer: Int32Array;
    tracingToLinkBuffer: Int32Array;
}
interface NodeConfig {
    map: THREE.Texture;
    count: number;
    indexArr: Array<number>;
}
interface LineConfig {
    lineWidth: number;
    dashed: boolean;
    count: number;
    indexArr: Array<number>;
}
interface Mesh {
    geometry: any;
    material: THREE.Material;
    mesh: any;
}
interface ItemMesh extends Mesh {
    material: any;
    config?: NodeConfig | LineConfig;
    positions: Float32Array;
    rotates?: Float32Array;
    colors?: Float32Array;
}
interface GraphPerfInfo {
    nodeCounts: number;
    linkCounts: number;
    tracingToLinkCounts: number;
    layoutPastTime: number;
    layoutProgress: string;
    layoutStartTime: number;
    prevTickTime: number;
    targetTick: number;
    intervalTime: number;
    layouting: boolean;
}
interface MouseStatus {
    mouseOnChart: boolean;
    mouseDownStatus: boolean;
    mouseDownNodeStatus: boolean;
    mousePosition: THREE.Vector2;
    mouseWorldPosition: THREE.Vector2;
}
interface ViewportRect {
    left: number;
    right: number;
    top: number;
    bottom: number;
}
interface VisibleNode {
    id: string;
    x: number;
    y: number;
}
export declare class D3ForceGraph {
    $container: HTMLElement;
    containerRect: ClientRect;
    data: GraphData;
    config: GraphBaseConfig;
    perfInfo: GraphPerfInfo;
    processedData: ProcessedData;
    worker: Worker;
    targetPositionStatus: Float32Array;
    currentPositionStatus: Float32Array;
    cachePositionStatus: Float32Array;
    mouseStatus: MouseStatus;
    rafId: number;
    highlighted: string;
    throttleTimer: number;
    events: mitt.Emitter;
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    controls: any;
    nodes: {
        [key: string]: ItemMesh;
    };
    eventNodes: {
        [key: string]: ItemMesh;
    };
    lines: {
        [key: string]: ItemMesh;
    };
    callPerMinuteNums: {
        [key: string]: ItemMesh;
    };
    circles: ItemMesh;
    arrows: ItemMesh;
    callPerMinuteUnits: ItemMesh;
    hlNodes: Array<MaterialSegment>;
    hlLines: Array<MaterialSegment>;
    hlCircles: Array<number>;
    hlArrows: Array<number>;
    hlTexts: Array<Mesh>;
    constructor(dom: HTMLElement, data: GraphData, graphBaseConfig?: GraphBaseConfig);
    init(): void;
    prepareScene(): void;
    /**
     * preProcessData
     * preprocess data
     *
     * @returns {ProcessedData}
     * @memberof D3ForceGraph
     */
    preProcessData(): void;
    prepareNodesData(node: Node, index: number): void;
    prepareLinesData(link: Link, tracingToLinkBuffer: Array<number>): void;
    prepareCallPerMinuteNumsData(link: Link): void;
    prepareBasicMesh(): void;
    prepareNodesMesh(): void;
    prepareEventNodesMesh(): void;
    prepareLinesMesh(): void;
    prepareCirclesMesh(): void;
    prepareArrowsMesh(): void;
    prepareCallPerMinuteNumsMesh(): void;
    prepareCallPerMinuteUnitsMesh(): void;
    updatePosition(nodesPosition: Float32Array): void;
    updateNodesPosition(nodesPosition: Float32Array): void;
    updateEventNodesPosition(nodesPosition: Float32Array): void;
    updateLinesPosition(nodesPosition: Float32Array): void;
    updateCirclesPosition(nodesPosition: Float32Array): void;
    updateCallPerMinuteNumsPosition(nodesPosition: Float32Array): void;
    updateCallPerMinuteUnitsPosition(nodesPosition: Float32Array): void;
    updateArrowsPosition(nodesPosition: Float32Array): void;
    initWorker(): void;
    start(): void;
    installControls(): void;
    startRender(): void;
    stopRender(): void;
    render(): void;
    renderTopo(): void;
    renderLineAnimation(): void;
    checkFinalStatus(): void;
    updateHighLight(): void;
    highlightNodeType(name: string, index: number): void;
    highlightLineType(name: string, index: number): void;
    highlightCircleType(index: number): void;
    unhighlight(): void;
    resetAllMeshColor(): void;
    prepareDarkenData(typeArr: Array<string>): void;
    addHighLight(): void;
    highlightNodes(isHighlight: boolean): void;
    highlightLines(isHighlight: boolean): void;
    highlightArrows(isHighlight: boolean): void;
    highlightCircles(isHighlight: boolean): void;
    addHlTextsMesh(): void;
    addLineTextMesh(line: Link): void;
    refreshMouseStatus(event: MouseEvent): void;
    mouseMoveHandler(event: MouseEvent): void;
    mouseOutHandler(): void;
    mouseDownHandler(event: MouseEvent): void;
    mouseUpHandler(): void;
    mouseWheelHandler(event: MouseWheelEvent): void;
    mouseMoveHandlerBinded: any;
    mouseWheelHandlerBinded: any;
    mouseDownHandlerBinded: any;
    mouseUpHandlerBinded: any;
    chartMouseEnterHandler(): void;
    chartMouseLeaveHandler(): void;
    bindEvent(): void;
    unbindEvent(): void;
    destroy(): void;
    resize(width: number, height: number): void;
    getOffset(size1: number, size2: number): number;
    createTextTexture(text: string, width: number, height: number, fontSize: number): THREE.Texture;
    getLineWidth(speed: number): number;
    getEventLabel(event: number): string;
    getNodeLabel(type: string, middleWareType: string): string;
    getPositionZ(nodesCount: number): number;
    getDistance(nodesCount: number): number;
    getStrength(nodesCount: number): number;
    getCol(nodesCount: number): number;
    getAllVisibleNodes(): Array<VisibleNode>;
    getViewPortRect(): ViewportRect;
}
export {};

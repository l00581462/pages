import * as THREE from 'three';
import mitt from 'mitt';
import './index.css';
declare type RGBA = [number, number, number, number];
declare type RGB = [number, number, number];
interface D3Link {
    source: string;
    target: string;
}
interface Node {
    id: string;
    type: string;
    index?: number;
    faceIndex?: number;
    name?: string;
    event?: number;
    middleWareType?: string;
}
interface Link {
    source: string;
    target: string;
    lineType?: string;
    speed?: number;
}
interface GraphData {
    nodes: Array<Node>;
    links: Array<Link>;
}
interface GraphBaseConfig {
    width: number;
    height: number;
    themeColor?: RGBA;
    lineColor?: RGBA;
    dashSize?: number;
    dashScale?: number;
    gapSize?: number;
    nodeSize?: number;
    eventNodeSize?: number;
    lineWidth?: number;
    backgroundColor?: RGB;
    highlightColor?: RGBA;
    nodeHighlightColor?: RGBA;
    showStatTable?: boolean;
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
    mousePosition: THREE.Vector2;
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
    speed: {
        [key: string]: ItemMesh;
    };
    circles: ItemMesh;
    arrows: ItemMesh;
    speedUnits: ItemMesh;
    hlNodes: Array<{
        name: string;
        faceIndex: number;
    }>;
    hlLines: Array<{
        name: string;
        faceIndex: number;
    }>;
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
    prepareLinksData(params: {
        link: Link;
        sourceIndex: number;
        targetIndex: number;
        linkIndex: number;
        tracingToLinkBuffer: Array<number>;
    }): void;
    prepareSpeedData(link: Link, sourceIndex: number, targetIndex: number): void;
    prepareBasicMesh(): void;
    prepareNodeMesh(): void;
    prepareEventNodeMesh(): void;
    prepareLineMesh(): void;
    prepareCircleMesh(): void;
    prepareArrowMesh(): void;
    prepareSpeedMesh(): void;
    prepareSpeedUnitMesh(): void;
    updatePosition(nodesPosition: Float32Array): void;
    updateNodePosition(nodesPosition: Float32Array): void;
    updateEventNodePosition(nodesPosition: Float32Array): void;
    updateLinePosition(nodesPosition: Float32Array): void;
    updateCirclePosition(nodesPosition: Float32Array): void;
    updateSpeedPosition(nodesPosition: Float32Array): void;
    updateSpeedUnitPosition(nodesPosition: Float32Array): void;
    updateArrowPosition(nodesPosition: Float32Array): void;
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
    addHighLight(): void;
    highlightNodes(isHighlight: boolean): void;
    highlightLines(isHighlight: boolean): void;
    highlightArrows(isHighlight: boolean): void;
    highlightCircles(isHighlight: boolean): void;
    addHlTextsMesh(): void;
    mouseMoveHandler(event: MouseEvent): void;
    mouseOutHandler(): void;
    mouseMoveHandlerBinded: any;
    mouseOutHandlerBinded: any;
    chartMouseEnterHandler(): void;
    chartMouseLeaveHandler(): void;
    chartMouseEnterHandlerBinded: any;
    chartMouseLeaveHandlerBinded: any;
    bindEvent(): void;
    unbindEvent(): void;
    destroy(): void;
    resize(width: number, height: number): void;
    createTextTexture(text: string, width: number, height: number, fontSize: number): THREE.Texture;
    getLineWidth(speed: number): number;
    getEventType(event: number): string;
    getNodeType(type: string, middleWareType: string): string;
    getPositionZ(nodesCount: number): number;
    getDistance(nodesCount: number): number;
    getStrength(nodesCount: number): number;
    getCol(nodesCount: number): number;
    getAllVisibleNodes(): Array<VisibleNode>;
    getViewPortRect(): ViewportRect;
}
export {};

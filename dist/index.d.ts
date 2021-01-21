import * as THREE from 'three';
import mitt from 'mitt';
import './index.css';
declare type RGB = [number, number, number];
interface GraphData {
    nodes: Array<{
        id: string;
        name?: string;
        image?: string;
    }>;
    links: Array<{
        source: string;
        target: string;
        color?: RGB;
        lineType?: string;
        speed?: number;
    }>;
}
interface GraphBaseConfig {
    width: number;
    height: number;
    themeColor?: RGB;
    nodeColor?: RGB;
    lineColor?: RGB;
    dashSize?: number;
    dashScale?: number;
    gapSize?: number;
    nodeSize?: number;
    lineWidth?: number;
    backgroundColor?: RGB;
    highLightColor?: RGB;
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
interface D3Link {
    source: string;
    target: string;
}
interface ProcessedData extends D3ForceData {
    nodeInfoMap: {
        [key: string]: {
            index: number;
            image?: string;
            name?: string;
            imageTexture?: THREE.Texture;
        };
    };
    linkInfoMap: {
        [key: string]: {
            lineType: string;
            speed?: number;
        };
    };
    linkBuffer: Int32Array;
    statTable: Array<{
        source: string;
        count: number;
    }>;
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
    lockHighlightToken: false;
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    controls: any;
    nodes: {
        [key: string]: ItemMesh;
    };
    lines: {
        [key: string]: ItemMesh;
    };
    circles: ItemMesh;
    arrows: ItemMesh;
    hlNodes: Array<{
        name: string;
        index: number;
    }>;
    hlLines: Array<{
        name: string;
        faceIndex: number;
    }>;
    hlText: Mesh;
    constructor(dom: HTMLElement, data: GraphData, graphBaseConfig?: GraphBaseConfig);
    init(): void;
    /**
     * preProcessData
     * preprocess data
     *
     * @returns {ProcessedData}
     * @memberof D3ForceGraph
     */
    preProcessData(): ProcessedData;
    getLineWidth(speed: number): number;
    prepareScene(): void;
    prepareBasicMesh(): void;
    prepareNodeMesh(name: string, nodeConfig: NodeConfig): void;
    prepareLineMesh(name: string, linkConfig: LineConfig): void;
    prepareCircleMesh(): void;
    initWorker(): void;
    start(): void;
    installControls(): void;
    startRender(): void;
    stopRender(): void;
    render(): void;
    renderTopo(): void;
    renderLineAnimation(): void;
    checkFinalStatus(): void;
    renderArrow(): void;
    updatePosition(nodesPosition: Float32Array): void;
    updateNodePosition(name: string, nodesPosition: Float32Array): void;
    updateLinePosition(name: string, nodesPosition: Float32Array): void;
    updateCirclePosition(nodesPosition: Float32Array): void;
    updateHighLight(): void;
    getAllVisibleNodes(): Array<VisibleNode>;
    getViewPortRect(): ViewportRect;
    highlight(id: string): void;
    unhighlight(): void;
    addHighLight(): void;
    highlightNodes(isHighlight: boolean): void;
    highlightLines(isHighlight: boolean): void;
    prepareHlTextsMesh(sourceId: string): void;
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
    getPositionZ(nodesCount: number): number;
    getDistance(nodesCount: number): number;
    getStrength(nodesCount: number): number;
    getCol(nodesCount: number): number;
}
export {};

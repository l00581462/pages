"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const THREE = require("three");
const OrbitControls_1 = require("three/examples/jsm/controls/OrbitControls");
const LineSegmentsGeometry_1 = require("three/examples/jsm/lines/LineSegmentsGeometry");
const LineSegments2_1 = require("three/examples/jsm/lines/LineSegments2");
const LineMaterial_1 = require("three/examples/jsm/lines/LineMaterial");
const pngLoader_1 = require("./pngLoader");
const v3 = require("v3js");
const worker = require("./worker.js");
const nodesVS = require("./shaders/nodes.vs");
const nodesFS = require("./shaders/nodes.fs");
const arrowsVS = require("./shaders/arrows.vs");
const arrowsFS = require("./shaders/arrows.fs");
const textFS = require("./shaders/text.fs");
const textVS = require("./shaders/text.vs");
const mitt_1 = require("mitt");
require("./index.css");
const THEME_OPACITY = 0.373;
const DARK_OPACITY = 0.1;
const WHITE_COLOR = [1, 1, 1];
const HL_COLOR = [1, 1, 0];
const NODE_HL_COLOR = [8.5, 2.36, 0];
const BACKGROUND_COLOR = [61 / 255, 68 / 255, 79 / 255];
const THEME_COLOR = [33 / 255, 126 / 255, 242 / 255];
const LINE_COLOR = BACKGROUND_COLOR.map((val, i) => val * (1 - THEME_OPACITY) + THEME_COLOR[i] * THEME_OPACITY);
const DARK_LINE_COLOR = BACKGROUND_COLOR.map((val, i) => val * (1 - DARK_OPACITY) + THEME_COLOR[i] * DARK_OPACITY);
const DARK_HL_COLOR = BACKGROUND_COLOR.map((val, i) => val * (1 - DARK_OPACITY) + HL_COLOR[i] * DARK_OPACITY);
const textureLoader = new THREE.TextureLoader();
const textureMap = new pngLoader_1.PngLoader().result;
const NODE_SIZE = 15000;
const GRAPH_BASE_CONFIG = {
    width: 400,
    height: 400,
    nodeSize: NODE_SIZE,
    circleSize: NODE_SIZE * 0.33,
    arrowSize: NODE_SIZE * 0.8,
    eventNodeSize: NODE_SIZE * 0.5,
    textSize: NODE_SIZE * 0.25,
    dashSize: 5,
    gapSize: 3,
    dashScale: 1,
    lineWidth: 1,
    showStatTable: true,
    zoomScale: 15,
    zoomNear: 75,
    zoomFar: 30000,
    debug: false
};
const GRAPH_DEFAULT_PERF_INFO = {
    nodeCounts: 0,
    linkCounts: 0,
    tracingToLinkCounts: 0,
    layoutPastTime: 0,
    layoutProgress: '',
    layoutStartTime: 0,
    prevTickTime: 0,
    targetTick: 0,
    intervalTime: 0,
    layouting: false
};
class D3ForceGraph {
    constructor(dom, data, graphBaseConfig = GRAPH_BASE_CONFIG) {
        this.mouseStatus = {
            mouseOnChart: false,
            mouseDownStatus: false,
            mouseDownNodeStatus: false,
            mousePosition: new THREE.Vector2(-9999, -9999),
            mouseWorldPosition: new THREE.Vector2(-9999, -9999)
        };
        this.nodes = {};
        this.eventNodes = {};
        this.lines = {};
        this.callPerMinuteNums = {};
        this.circles = {
            geometry: null,
            material: null,
            mesh: null,
            positions: null,
            colors: null
        };
        this.arrows = {
            geometry: null,
            material: null,
            rotates: null,
            mesh: null,
            positions: null,
            colors: null
        };
        this.callPerMinuteUnits = {
            geometry: null,
            material: null,
            rotates: null,
            mesh: null,
            positions: null,
            colors: null
        };
        this.lineInfoText = null;
        this.hlNodes = [];
        this.hlLines = [];
        this.hlCircles = [];
        this.hlArrows = [];
        this.hlTexts = [];
        this.mouseMoveHandlerBinded = this.mouseMoveHandler.bind(this);
        this.mouseWheelHandlerBinded = this.mouseWheelHandler.bind(this);
        this.mouseDownHandlerBinded = this.mouseDownHandler.bind(this);
        this.mouseUpHandlerBinded = this.mouseUpHandler.bind(this);
        this.$container = dom;
        this.data = data;
        this.config = Object.assign({}, GRAPH_BASE_CONFIG, graphBaseConfig);
        this.perfInfo = Object.assign({}, GRAPH_DEFAULT_PERF_INFO);
        this.events = new mitt_1.default();
        this.init();
    }
    init() {
        try {
            this.preProcessData();
            this.perfInfo.nodeCounts = this.processedData.nodes.length;
            this.perfInfo.linkCounts = this.processedData.links.length;
            this.prepareScene();
            this.prepareBasicMesh();
            this.installControls();
            this.bindEvent();
            this.initWorker();
            this.start();
        }
        catch (e) {
            console.log(e);
        }
    }
    prepareScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(...BACKGROUND_COLOR);
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            logarithmicDepthBuffer: true
        });
        this.renderer.setSize(this.config.width, this.config.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.$container.appendChild(this.renderer.domElement);
        this.camera = new THREE.PerspectiveCamera(45, this.config.width / this.config.height, this.config.zoomNear, this.config.zoomFar);
        this.camera.position.set(0, 0, this.getPositionZ(this.processedData.nodes.length));
        this.camera.up = new THREE.Vector3(0, 0, 1);
        this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
        this.containerRect = this.$container.getBoundingClientRect();
        this.$container.classList.add('d3-force-graph-container');
        this.distanceVector = this.camera.position.clone().sub(new THREE.Vector3(0, 0, 0));
        this.projectionMatrix = this.camera.projectionMatrix.clone();
        this.modelViewMatrix = this.camera.matrixWorldInverse.clone().multiply(this.scene.matrixWorld);
    }
    /**
     * preProcessData
     * preprocess data
     *
     * @returns {ProcessedData}
     * @memberof D3ForceGraph
     */
    preProcessData() {
        this.processedData = {
            nodes: [],
            links: [],
            nodeInfoMap: {},
            linkInfoMap: {},
            nodeTypeRelatedData: {},
            linkBuffer: null,
            tracingToLinkBuffer: null
        };
        let nodeCount = 0;
        this.data.nodes.forEach(e => {
            if (!this.processedData.nodeInfoMap[e.id]) {
                this.processedData.nodes.push({
                    id: e.id
                });
                this.processedData.nodeInfoMap[e.id] = {
                    id: e.id,
                    name: e.name,
                    label: this.getNodeLabel(e.label, e.middleWareType),
                    eventCount: e.eventCount,
                    middleWareType: e.middleWareType,
                    index: nodeCount,
                    faceIndex: 0
                };
                this.prepareNodesData(e, nodeCount);
                nodeCount++;
            }
        });
        let linkBuffer = [];
        let tracingToLinkBuffer = [];
        let linkIndex = 0;
        this.data.links.forEach(e => {
            if (e.source === e.target)
                return;
            let linkInfoKey = `${e.source}-${e.target}`;
            if (!this.processedData.linkInfoMap[linkInfoKey]) {
                this.processedData.links.push({
                    source: e.source,
                    target: e.target
                });
                let sourceIndex = this.processedData.nodeInfoMap[e.source].index;
                let targetIndex = this.processedData.nodeInfoMap[e.target].index;
                linkBuffer.push(sourceIndex, targetIndex);
                this.processedData.linkInfoMap[linkInfoKey] = {
                    id: e.id,
                    name: e.name,
                    label: e.label,
                    callPerMinute: e.callPerMinute,
                    source: e.source,
                    target: e.target,
                    index: linkIndex
                };
                this.prepareLinesData(this.processedData.linkInfoMap[linkInfoKey], tracingToLinkBuffer);
                this.prepareCallPerMinuteNumsData(this.processedData.linkInfoMap[linkInfoKey]);
                linkIndex++;
            }
        });
        this.processedData.linkBuffer = new Int32Array(linkBuffer);
        this.processedData.tracingToLinkBuffer = new Int32Array(tracingToLinkBuffer);
    }
    prepareNodesData(node, index) {
        let nodeType = this.getNodeLabel(node.label, node.middleWareType);
        if (!this.nodes[nodeType]) {
            this.nodes[nodeType] = {
                config: {
                    map: textureLoader.load(textureMap[nodeType.toUpperCase()]),
                    count: 1,
                    indexArr: [index]
                },
                material: null,
                positions: null,
                geometry: null,
                mesh: null,
                colors: null
            };
        }
        else {
            this.processedData.nodeInfoMap[node.id].faceIndex = this.nodes[nodeType].config.count;
            this.nodes[nodeType].config.count++;
            this.nodes[nodeType].config.indexArr.push(index);
        }
        // 初始化每类节点的关联元素
        if (!this.processedData.nodeTypeRelatedData[nodeType]) {
            this.processedData.nodeTypeRelatedData[nodeType] = {
                lines: [],
                eventNodes: [],
                callPerMinuteNums: []
            };
        }
        let eventType = this.getEventLabel(node.eventCount);
        if (eventType) {
            if (!this.eventNodes[eventType]) {
                this.eventNodes[eventType] = {
                    config: {
                        map: textureLoader.load(textureMap[eventType.toUpperCase()]),
                        count: 1,
                        indexArr: [index]
                    },
                    material: null,
                    positions: null,
                    geometry: null,
                    mesh: null,
                    colors: null
                };
            }
            else {
                this.eventNodes[eventType].config.count++;
                this.eventNodes[eventType].config.indexArr.push(index);
            }
            this.processedData.nodeTypeRelatedData[nodeType].eventNodes.push({
                name: eventType,
                faceIndex: this.eventNodes[eventType].config.count - 1
            });
        }
    }
    prepareLinesData(link, tracingToLinkBuffer) {
        let sourceIndex = this.processedData.nodeInfoMap[link.source].index;
        let targetIndex = this.processedData.nodeInfoMap[link.target].index;
        let lineWidth;
        let lineType;
        let dashed;
        let tracingToLinkIndex;
        if (link.label === 'CreateOn') {
            lineWidth = 2;
            lineType = link.label;
            dashed = false;
            tracingToLinkIndex = -1;
        }
        else {
            lineWidth = this.getLineWidth(link.callPerMinute);
            lineType = 'TracingTo' + lineWidth;
            dashed = true;
            tracingToLinkIndex = this.perfInfo.tracingToLinkCounts;
            this.perfInfo.tracingToLinkCounts++;
            tracingToLinkBuffer.push(sourceIndex, targetIndex, link.index, this.lines[lineType] ? this.lines[lineType].config.count : 0, lineWidth);
        }
        if (!this.lines[lineType]) {
            this.lines[lineType] = {
                config: {
                    lineWidth: lineWidth,
                    count: 1,
                    dashed: dashed,
                    indexArr: [
                        sourceIndex,
                        targetIndex,
                        link.index,
                        tracingToLinkIndex
                    ]
                },
                material: null,
                positions: null,
                geometry: null,
                mesh: null,
                colors: null
            };
        }
        else {
            this.lines[lineType].config.count++;
            this.lines[lineType].config.indexArr.push(sourceIndex, targetIndex, link.index, tracingToLinkIndex);
        }
        let sourceNodeType = this.processedData.nodeInfoMap[link.source].label;
        let targetNodeType = this.processedData.nodeInfoMap[link.target].label;
        this.processedData.nodeTypeRelatedData[sourceNodeType].lines.push({
            name: lineType,
            faceIndex: this.lines[lineType].config.count - 1
        });
        this.processedData.nodeTypeRelatedData[targetNodeType].lines.push({
            name: lineType,
            faceIndex: this.lines[lineType].config.count - 1
        });
    }
    prepareCallPerMinuteNumsData(link) {
        let sourceNode = this.processedData.nodeInfoMap[link.source];
        let targetNode = this.processedData.nodeInfoMap[link.target];
        let sourceNodeIndex = sourceNode.index;
        let targetNodeIndex = targetNode.index;
        let sourceNodeType = sourceNode.label;
        let targetNodeType = targetNode.label;
        let speedStr = link.callPerMinute ? '' + link.callPerMinute : '';
        for (let i = speedStr.length - 1, j = 0; i >= 0; i--, j++) {
            let num = speedStr[i];
            if (!this.callPerMinuteNums[num]) {
                this.callPerMinuteNums[num] = {
                    config: {
                        map: this.createTextTexture(num, 50, 50, 40),
                        count: 1,
                        indexArr: [sourceNodeIndex, targetNodeIndex, j]
                    },
                    material: null,
                    positions: null,
                    geometry: null,
                    mesh: null,
                    rotates: null,
                    colors: null
                };
            }
            else {
                this.callPerMinuteNums[num].config.count++;
                this.callPerMinuteNums[num].config.indexArr.push(sourceNodeIndex, targetNodeIndex, j);
            }
            this.processedData.nodeTypeRelatedData[sourceNodeType].callPerMinuteNums.push({
                name: num,
                faceIndex: this.callPerMinuteNums[num].config.count - 1
            });
            this.processedData.nodeTypeRelatedData[targetNodeType].callPerMinuteNums.push({
                name: num,
                faceIndex: this.callPerMinuteNums[num].config.count - 1
            });
        }
    }
    // 预准备节点与线，使用BufferGeometry，位置先定到-9999
    // z 关系
    // 高亮节点：0.0001
    // 头像：0.00005
    // 节点: 0
    // 高亮箭头：-0.0004
    // 箭头：-0.0007
    // 高亮线：-0.0009
    // 线：-0.001
    prepareBasicMesh() {
        this.perfInfo.layoutStartTime = Date.now();
        this.prepareNodesMesh();
        this.prepareEventNodesMesh();
        this.prepareLinesMesh();
    }
    prepareNodesMesh() {
        Object.keys(this.nodes).forEach((name) => {
            let nodeConfig = this.nodes[name].config;
            this.nodes[name].geometry = new THREE.BufferGeometry();
            this.nodes[name].positions = new Float32Array(nodeConfig.count * 3);
            this.nodes[name].colors = new Float32Array(nodeConfig.count * 4);
            this.nodes[name].material = new THREE.ShaderMaterial({
                depthTest: false,
                transparent: true,
                uniforms: {
                    map: { value: nodeConfig.map },
                    size: { value: this.config.nodeSize }
                },
                vertexShader: nodesVS(),
                fragmentShader: nodesFS()
            });
            this.processedData.nodes.forEach((e, i) => {
                this.nodes[name].positions[i * 3] = -9999;
                this.nodes[name].positions[i * 3 + 1] = -9999;
                this.nodes[name].positions[i * 3 + 2] = 0;
                this.nodes[name].colors[i * 4] = 1;
                this.nodes[name].colors[i * 4 + 1] = 1;
                this.nodes[name].colors[i * 4 + 2] = 1;
                this.nodes[name].colors[i * 4 + 3] = 1;
            });
            this.nodes[name].geometry.setAttribute('position', new THREE.BufferAttribute(this.nodes[name].positions, 3));
            this.nodes[name].geometry.setAttribute('color', new THREE.BufferAttribute(this.nodes[name].colors, 4));
            this.nodes[name].geometry.computeBoundingSphere();
            this.nodes[name].mesh = new THREE.Points(this.nodes[name].geometry, this.nodes[name].material);
            this.nodes[name].mesh.name = 'basePoints-' + name;
            this.scene.add(this.nodes[name].mesh);
        });
    }
    prepareEventNodesMesh() {
        Object.keys(this.eventNodes).forEach((name) => {
            let nodeConfig = this.eventNodes[name].config;
            this.eventNodes[name].geometry = new THREE.BufferGeometry();
            this.eventNodes[name].positions = new Float32Array(nodeConfig.count * 3);
            this.eventNodes[name].colors = new Float32Array(nodeConfig.count * 4);
            this.eventNodes[name].material = new THREE.ShaderMaterial({
                depthTest: false,
                transparent: true,
                uniforms: {
                    map: { value: nodeConfig.map },
                    size: { value: this.config.eventNodeSize }
                },
                vertexShader: nodesVS(),
                fragmentShader: nodesFS()
            });
            this.processedData.nodes.forEach((e, i) => {
                this.eventNodes[name].positions[i * 3] = -9999;
                this.eventNodes[name].positions[i * 3 + 1] = -9999;
                this.eventNodes[name].positions[i * 3 + 2] = -0.002;
                this.eventNodes[name].colors[i * 4] = 1;
                this.eventNodes[name].colors[i * 4 + 1] = 1;
                this.eventNodes[name].colors[i * 4 + 2] = 1;
                this.eventNodes[name].colors[i * 4 + 3] = 1;
            });
            this.eventNodes[name].geometry.setAttribute('position', new THREE.BufferAttribute(this.eventNodes[name].positions, 3));
            this.eventNodes[name].geometry.setAttribute('color', new THREE.BufferAttribute(this.eventNodes[name].colors, 4));
            this.eventNodes[name].geometry.computeBoundingSphere();
            this.eventNodes[name].mesh = new THREE.Points(this.eventNodes[name].geometry, this.eventNodes[name].material);
            this.eventNodes[name].mesh.name = 'baseEventPoints-' + name;
            this.scene.add(this.eventNodes[name].mesh);
        });
    }
    prepareLinesMesh() {
        Object.keys(this.lines).forEach((name) => {
            let item = this.lines[name];
            let config = item.config;
            item.geometry = new LineSegmentsGeometry_1.LineSegmentsGeometry();
            item.positions = new Float32Array(config.count * 6);
            item.colors = new Float32Array(config.count * 6);
            item.material = new LineMaterial_1.LineMaterial({
                linewidth: config.lineWidth,
                dashed: config.dashed,
                vertexColors: true,
                dashSize: this.config.dashSize,
                gapSize: this.config.gapSize,
                dashScale: this.config.dashScale
            });
            if (config.dashed)
                item.material.defines.USE_DASH = '';
            item.material.resolution = new THREE.Vector2(this.config.width, this.config.height);
            this.processedData.links.forEach((e, i) => {
                item.positions[i * 6] = -9999;
                item.positions[i * 6 + 1] = -9999;
                item.positions[i * 6 + 2] = -0.01;
                item.positions[i * 6 + 3] = -9999;
                item.positions[i * 6 + 4] = -9999;
                item.positions[i * 6 + 5] = -0.01;
                item.colors[i * 6] = LINE_COLOR[0];
                item.colors[i * 6 + 1] = LINE_COLOR[1];
                item.colors[i * 6 + 2] = LINE_COLOR[2];
                item.colors[i * 6 + 3] = LINE_COLOR[0];
                item.colors[i * 6 + 4] = LINE_COLOR[1];
                item.colors[i * 6 + 5] = LINE_COLOR[2];
            });
            item.geometry.setPositions(item.positions);
            item.geometry.setColors(item.colors);
            item.mesh = new LineSegments2_1.LineSegments2(item.geometry, item.material);
            item.mesh.computeLineDistances();
            item.mesh.name = 'baseLines-' + name;
            this.scene.add(item.mesh);
        });
    }
    prepareCirclesMesh() {
        this.circles.geometry = new THREE.BufferGeometry();
        this.circles.positions = new Float32Array(this.perfInfo.tracingToLinkCounts * 3);
        this.circles.colors = new Float32Array(this.perfInfo.tracingToLinkCounts * 4);
        this.circles.material = new THREE.ShaderMaterial({
            transparent: true,
            depthTest: false,
            uniforms: {
                map: { value: textureLoader.load(textureMap['circle'.toUpperCase()]) },
                size: { value: this.config.circleSize }
            },
            vertexShader: nodesVS(),
            fragmentShader: nodesFS()
        });
        for (let i = 0; i < this.perfInfo.tracingToLinkCounts; i++) {
            this.circles.positions[i * 3] = -9999;
            this.circles.positions[i * 3 + 1] = -9999;
            this.circles.positions[i * 3 + 2] = -0.004;
            this.circles.colors[i * 4] = THEME_COLOR[0];
            this.circles.colors[i * 4 + 1] = THEME_COLOR[1];
            this.circles.colors[i * 4 + 2] = THEME_COLOR[2];
            this.circles.colors[i * 4 + 3] = THEME_OPACITY;
        }
        this.circles.geometry.setAttribute('position', new THREE.BufferAttribute(this.circles.positions, 3));
        this.circles.geometry.setAttribute('color', new THREE.BufferAttribute(this.circles.colors, 4));
        this.circles.geometry.computeBoundingSphere();
        this.circles.mesh = new THREE.Points(this.circles.geometry, this.circles.material);
        this.circles.mesh.name = 'baseCircles';
        this.scene.add(this.circles.mesh);
    }
    prepareArrowsMesh() {
        this.arrows.geometry = new THREE.BufferGeometry();
        this.arrows.positions = new Float32Array(this.perfInfo.linkCounts * 3);
        this.arrows.rotates = new Float32Array(this.perfInfo.linkCounts);
        this.arrows.colors = new Float32Array(this.perfInfo.linkCounts * 4);
        this.arrows.material = new THREE.ShaderMaterial({
            depthTest: false,
            transparent: true,
            uniforms: {
                map: { value: textureLoader.load(textureMap['arrow'.toUpperCase()]) },
                size: { value: this.config.arrowSize }
            },
            vertexShader: arrowsVS(),
            fragmentShader: arrowsFS()
        });
        for (let i = 0; i < this.perfInfo.linkCounts; i++) {
            this.arrows.positions[i * 3] = -9999;
            this.arrows.positions[i * 3 + 1] = -9999;
            this.arrows.positions[i * 3 + 2] = -0.006;
            this.arrows.rotates[i] = 0;
            this.arrows.colors[i * 4] = THEME_COLOR[0];
            this.arrows.colors[i * 4 + 1] = THEME_COLOR[1];
            this.arrows.colors[i * 4 + 2] = THEME_COLOR[2];
            this.arrows.colors[i * 4 + 3] = THEME_OPACITY;
        }
        this.arrows.geometry.setAttribute('position', new THREE.BufferAttribute(this.arrows.positions, 3));
        this.arrows.geometry.setAttribute('rotate', new THREE.BufferAttribute(this.arrows.rotates, 1));
        this.arrows.geometry.setAttribute('color', new THREE.BufferAttribute(this.arrows.colors, 4));
        this.arrows.geometry.computeBoundingSphere();
        this.arrows.mesh = new THREE.Points(this.arrows.geometry, this.arrows.material);
        this.arrows.mesh.name = 'arrows';
        this.scene.add(this.arrows.mesh);
    }
    prepareCallPerMinuteNumsMesh() {
        Object.keys(this.callPerMinuteNums).forEach(name => {
            let config = this.callPerMinuteNums[name].config;
            let item = this.callPerMinuteNums[name];
            item.geometry = new THREE.BufferGeometry();
            item.positions = new Float32Array(config.count * 3);
            item.rotates = new Float32Array(config.count);
            item.colors = new Float32Array(config.count * 4);
            item.material = new THREE.ShaderMaterial({
                transparent: true,
                depthTest: false,
                uniforms: {
                    map: { value: config.map },
                    size: { value: this.config.textSize }
                },
                vertexShader: textVS(),
                fragmentShader: textFS()
            });
            for (let i = 0; i < config.count; i++) {
                item.positions[i * 3] = -9999;
                item.positions[i * 3 + 1] = -9999;
                item.positions[i * 3 + 2] = -0.001;
                item.rotates[i] = 0;
                item.colors[i * 4] = 1;
                item.colors[i * 4 + 1] = 1;
                item.colors[i * 4 + 2] = 1;
                item.colors[i * 4 + 3] = 1;
            }
            item.geometry.setAttribute('position', new THREE.BufferAttribute(item.positions, 3));
            item.geometry.setAttribute('rotate', new THREE.BufferAttribute(item.rotates, 1));
            item.geometry.setAttribute('color', new THREE.BufferAttribute(item.colors, 4));
            item.geometry.computeBoundingSphere();
            item.mesh = new THREE.Points(item.geometry, item.material);
            item.mesh.name = 'speed';
            this.scene.add(item.mesh);
        });
    }
    prepareCallPerMinuteUnitsMesh() {
        let item = this.callPerMinuteUnits;
        item.geometry = new THREE.BufferGeometry();
        item.positions = new Float32Array(this.perfInfo.tracingToLinkCounts * 3);
        item.rotates = new Float32Array(this.perfInfo.tracingToLinkCounts);
        item.colors = new Float32Array(this.perfInfo.tracingToLinkCounts * 4);
        item.material = new THREE.ShaderMaterial({
            transparent: true,
            depthTest: false,
            uniforms: {
                map: { value: this.createTextTexture('r/min', 200, 200, 40) },
                size: { value: this.config.textSize * 4 }
            },
            vertexShader: textVS(),
            fragmentShader: textFS()
        });
        for (let i = 0; i < this.perfInfo.tracingToLinkCounts; i++) {
            item.positions[i * 3] = -9999;
            item.positions[i * 3 + 1] = -9999;
            item.positions[i * 3 + 2] = -0.001;
            item.rotates[i] = 0;
            item.colors[i * 4] = 1;
            item.colors[i * 4 + 1] = 1;
            item.colors[i * 4 + 2] = 1;
            item.colors[i * 4 + 3] = 1;
        }
        item.geometry.setAttribute('position', new THREE.BufferAttribute(item.positions, 3));
        item.geometry.setAttribute('rotate', new THREE.BufferAttribute(item.rotates, 1));
        item.geometry.setAttribute('color', new THREE.BufferAttribute(item.colors, 4));
        item.geometry.computeBoundingSphere();
        item.mesh = new THREE.Points(item.geometry, item.material);
        item.mesh.name = 'speedUnits';
        this.scene.add(item.mesh);
    }
    // 更新节点与线的位置
    updatePosition(nodesPosition) {
        this.updateNodesPosition(nodesPosition);
        this.updateEventNodesPosition(this.currentPositionStatus);
        this.updateLinesPosition(nodesPosition);
    }
    updateNodesPosition(nodesPosition) {
        Object.keys(this.nodes).forEach((name) => {
            let nodeConfig = this.nodes[name].config;
            for (let i = 0; i < nodeConfig.count; i++) {
                this.nodes[name].positions[i * 3] = nodesPosition[nodeConfig.indexArr[i] * 2];
                this.nodes[name].positions[i * 3 + 1] = nodesPosition[nodeConfig.indexArr[i] * 2 + 1];
            }
            this.nodes[name].geometry.attributes.position = new THREE.BufferAttribute(this.nodes[name].positions, 3);
            this.nodes[name].geometry.computeBoundingSphere();
        });
    }
    updateEventNodesPosition(nodesPosition) {
        let scale = (1 + this.config.eventNodeSize / this.config.nodeSize);
        let offset = this.getOffset(this.config.nodeSize, this.config.eventNodeSize) / scale;
        Object.keys(this.eventNodes).forEach((name) => {
            let nodeConfig = this.eventNodes[name].config;
            for (let i = 0; i < nodeConfig.count; i++) {
                this.eventNodes[name].positions[i * 3] = nodesPosition[nodeConfig.indexArr[i] * 2] + offset;
                this.eventNodes[name].positions[i * 3 + 1] = nodesPosition[nodeConfig.indexArr[i] * 2 + 1] + offset;
            }
            this.eventNodes[name].geometry.attributes.position = new THREE.BufferAttribute(this.eventNodes[name].positions, 3);
            this.eventNodes[name].geometry.computeBoundingSphere();
        });
    }
    updateLinesPosition(nodesPosition) {
        Object.keys(this.lines).forEach((name) => {
            let item = this.lines[name];
            let config = item.config;
            for (let i = 0; i < config.count; i++) {
                item.positions[i * 6] = nodesPosition[config.indexArr[i * 4] * 2];
                item.positions[i * 6 + 1] = nodesPosition[config.indexArr[i * 4] * 2 + 1];
                item.positions[i * 6 + 3] = nodesPosition[config.indexArr[i * 4 + 1] * 2];
                item.positions[i * 6 + 4] = nodesPosition[config.indexArr[i * 4 + 1] * 2 + 1];
            }
            item.geometry.setPositions(item.positions);
            item.mesh.computeLineDistances();
        });
    }
    updateCirclesPosition(nodesPosition) {
        this.prepareCirclesMesh();
        for (let i = 0; i < this.perfInfo.tracingToLinkCounts; i++) {
            this.circles.positions[i * 3] =
                (nodesPosition[this.processedData.tracingToLinkBuffer[i * 5] * 2] +
                    nodesPosition[this.processedData.tracingToLinkBuffer[i * 5 + 1] * 2]) / 2;
            this.circles.positions[i * 3 + 1] =
                (nodesPosition[this.processedData.tracingToLinkBuffer[i * 5] * 2 + 1] +
                    nodesPosition[this.processedData.tracingToLinkBuffer[i * 5 + 1] * 2 + 1]) / 2;
        }
        this.circles.geometry.attributes.position = new THREE.BufferAttribute(this.circles.positions, 3);
        this.circles.geometry.computeBoundingSphere();
    }
    updateCallPerMinuteNumsPosition(nodesPosition) {
        this.prepareCallPerMinuteNumsMesh();
        let vec = new v3.Vector3(0, 0, 0);
        let up = new v3.Vector3(1, 0, 0);
        let vOffsetDistance = this.getOffset(this.config.circleSize, this.config.textSize);
        let pOffsetDistance = this.getOffset(this.config.textSize, this.config.textSize) / 2;
        Object.keys(this.callPerMinuteNums).forEach(name => {
            let item = this.callPerMinuteNums[name];
            let config = item.config;
            for (let i = 0; i < config.count; i++) {
                // 计算箭头的旋转方向与偏移位置
                let vecX = nodesPosition[config.indexArr[i * 3 + 1] * 2] -
                    nodesPosition[config.indexArr[i * 3] * 2];
                let vecY = nodesPosition[config.indexArr[i * 3 + 1] * 2 + 1] -
                    nodesPosition[config.indexArr[i * 3] * 2 + 1];
                let index = config.indexArr[i * 3 + 2] + 1;
                vec.x = vecX;
                vec.y = vecY;
                let angle = v3.Vector3.getAngle(vec, up);
                let vecNorm = v3.Vector3.getNorm(vec);
                let cos = vecX / vecNorm;
                let sin = vecY / vecNorm;
                if (vecY < 0) {
                    angle = 2 * Math.PI - angle;
                }
                item.positions[i * 3] =
                    (nodesPosition[config.indexArr[i * 3] * 2] +
                        nodesPosition[config.indexArr[i * 3 + 1] * 2]) / 2
                        - vOffsetDistance * sin - index * pOffsetDistance * cos;
                item.positions[i * 3 + 1] =
                    (nodesPosition[config.indexArr[i * 3] * 2 + 1] +
                        nodesPosition[config.indexArr[i * 3 + 1] * 2 + 1]) / 2 +
                        vOffsetDistance * cos - index * pOffsetDistance * sin;
                item.rotates[i] = angle;
                item.geometry.attributes.position = new THREE.BufferAttribute(item.positions, 3);
                item.geometry.attributes.rotates = new THREE.BufferAttribute(item.rotates, 1);
                item.geometry.computeBoundingSphere();
            }
        });
    }
    updateCallPerMinuteUnitsPosition(nodesPosition) {
        this.prepareCallPerMinuteUnitsMesh();
        let item = this.callPerMinuteUnits;
        let vec = new v3.Vector3(0, 0, 0);
        let up = new v3.Vector3(1, 0, 0);
        let offsetDistance = this.getOffset(this.config.circleSize, this.config.textSize);
        for (let i = 0; i < this.perfInfo.tracingToLinkCounts; i++) {
            // 计算箭头的旋转方向与偏移位置
            let vecX = nodesPosition[this.processedData.tracingToLinkBuffer[i * 5 + 1] * 2] -
                nodesPosition[this.processedData.tracingToLinkBuffer[i * 5] * 2];
            let vecY = nodesPosition[this.processedData.tracingToLinkBuffer[i * 5 + 1] * 2 + 1] -
                nodesPosition[this.processedData.tracingToLinkBuffer[i * 5] * 2 + 1];
            vec.x = vecX;
            vec.y = vecY;
            let angle = v3.Vector3.getAngle(vec, up);
            let vecNorm = v3.Vector3.getNorm(vec);
            let offsetX = vecX * offsetDistance / vecNorm;
            let offsetY = vecY * offsetDistance / vecNorm;
            if (vecY < 0) {
                angle = 2 * Math.PI - angle;
            }
            item.positions[i * 3] =
                (nodesPosition[this.processedData.tracingToLinkBuffer[i * 5] * 2] +
                    nodesPosition[this.processedData.tracingToLinkBuffer[i * 5 + 1] * 2]) / 2 - offsetY;
            item.positions[i * 3 + 1] =
                (nodesPosition[this.processedData.tracingToLinkBuffer[i * 5] * 2 + 1] +
                    nodesPosition[this.processedData.tracingToLinkBuffer[i * 5 + 1] * 2 + 1]) / 2 + offsetX;
            item.rotates[i] = angle;
        }
        item.geometry.attributes.position = new THREE.BufferAttribute(item.positions, 3);
        item.geometry.attributes.rotates = new THREE.BufferAttribute(item.rotates, 1);
        item.geometry.computeBoundingSphere();
    }
    updateArrowsPosition(nodesPosition) {
        this.prepareArrowsMesh();
        let vec = new v3.Vector3(0, 0, 0);
        let up = new v3.Vector3(1, 0, 0);
        let offset = this.getOffset(this.config.nodeSize, this.config.arrowSize);
        let linkBuffer = this.processedData.linkBuffer;
        for (let i = 0; i < this.perfInfo.linkCounts; i++) {
            // 计算箭头的旋转方向与偏移位置
            let vecX = nodesPosition[linkBuffer[i * 2 + 1] * 2] - nodesPosition[linkBuffer[i * 2] * 2];
            let vecY = nodesPosition[linkBuffer[i * 2 + 1] * 2 + 1] - nodesPosition[linkBuffer[i * 2] * 2 + 1];
            vec.x = vecX;
            vec.y = vecY;
            let angle = v3.Vector3.getAngle(vec, up);
            let vecNorm = v3.Vector3.getNorm(vec);
            let offsetX = vecX * offset / vecNorm;
            let offsetY = vecY * offset / vecNorm;
            if (vecY > 0) {
                angle = 2 * Math.PI - angle;
            }
            this.arrows.positions[i * 3] = nodesPosition[linkBuffer[i * 2 + 1] * 2] - offsetX;
            this.arrows.positions[i * 3 + 1] = nodesPosition[linkBuffer[i * 2 + 1] * 2 + 1] - offsetY;
            this.arrows.rotates[i] = angle;
        }
        this.arrows.geometry.attributes.position = new THREE.BufferAttribute(this.arrows.positions, 3);
        this.arrows.geometry.attributes.rotates = new THREE.BufferAttribute(this.arrows.rotates, 1);
        this.arrows.geometry.computeBoundingSphere();
    }
    initWorker() {
        let blob = new Blob([worker], {
            type: 'text/javascript'
        });
        this.worker = new Worker(window.URL.createObjectURL(blob));
    }
    start() {
        let message = {
            type: 'start',
            nodes: this.perfInfo.nodeCounts,
            DISTANCE: this.getDistance(this.perfInfo.nodeCounts),
            STRENGTH: this.getStrength(this.perfInfo.nodeCounts),
            COL: this.getCol(this.perfInfo.nodeCounts),
            linksBuffer: this.processedData.linkBuffer.slice().buffer
        };
        this.worker.postMessage(message, [message.linksBuffer]);
        this.worker.onmessage = (event) => {
            switch (event.data.type) {
                case ('tick'): {
                    // 每次 tick 时，记录该次 tick 时间和与上次 tick 的时间差，用于补间动画
                    let now = Date.now();
                    this.perfInfo.layouting = true;
                    this.perfInfo.layoutProgress = (event.data.progress * 100).toFixed(2);
                    this.perfInfo.layoutPastTime = now - this.perfInfo.layoutStartTime;
                    this.perfInfo.intervalTime = now - (this.perfInfo.prevTickTime || now);
                    this.perfInfo.prevTickTime = now;
                    if (event.data.currentTick === 1) {
                        // 第一帧不画，只记录
                        this.targetPositionStatus = new Float32Array(event.data.nodes);
                    }
                    else {
                        // 第二帧开始画第一帧，同时启动补间
                        if (event.data.currentTick === 2) {
                            this.currentPositionStatus = this.targetPositionStatus;
                            this.startRender();
                        }
                        this.targetPositionStatus = new Float32Array(event.data.nodes);
                        // 缓存当前 this.currentPositionStatus
                        if (this.currentPositionStatus) {
                            let len = this.currentPositionStatus.length;
                            if (!this.cachePositionStatus) {
                                this.cachePositionStatus = new Float32Array(len);
                            }
                            for (let i = 0; i < len; i++) {
                                this.cachePositionStatus[i] = this.currentPositionStatus[i];
                            }
                        }
                        this.perfInfo.targetTick = event.data.currentTick;
                    }
                    this.events.emit('tick', {
                        layoutProgress: this.perfInfo.layoutProgress
                    });
                    break;
                }
                case ('end'): {
                    this.perfInfo.layouting = false;
                    this.targetPositionStatus = new Float32Array(event.data.nodes);
                    break;
                }
            }
        };
    }
    installControls() {
        this.controls = new OrbitControls_1.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = false;
        this.controls.enableRotate = false;
        this.controls.enableZoom = false;
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.PAN
        };
    }
    // 启动渲染
    startRender() {
        if (!this.rafId) {
            this.rafId = requestAnimationFrame(this.render.bind(this));
        }
    }
    // 停止渲染，节约性能
    stopRender() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
    render() {
        this.rafId = null;
        // 限制放大缩小距离，最近75，最远16000
        this.perfInfo.layouting && this.renderTopo();
        if (!this.perfInfo.layouting) {
            this.renderLineAnimation();
            this.updateHighLight();
        }
        this.checkFinalStatus();
        this.renderer.render(this.scene, this.camera);
        this.startRender();
    }
    renderTopo() {
        // 节点数大于1000时，执行补间动画
        if (this.perfInfo.nodeCounts >= 1000) {
            let now = Date.now();
            let stepTime = now - this.perfInfo.prevTickTime;
            if (stepTime <= this.perfInfo.intervalTime && this.currentPositionStatus) {
                for (let i = 0; i < this.currentPositionStatus.length; i++) {
                    this.currentPositionStatus[i] = (this.targetPositionStatus[i] - this.cachePositionStatus[i]) / this.perfInfo.intervalTime * stepTime + this.cachePositionStatus[i];
                }
                this.updateNodesPosition(this.currentPositionStatus);
            }
        }
        else {
            if (this.currentPositionStatus && this.currentPositionStatus[0] !== this.targetPositionStatus[0]) {
                this.currentPositionStatus = this.targetPositionStatus;
                this.updatePosition(this.currentPositionStatus);
            }
        }
    }
    renderLineAnimation() {
        let scale = this.getPositionZ(2) / this.camera.position.z;
        Object.keys(this.lines).forEach((name) => {
            if (name === 'CreateOn')
                return;
            let lineWidth = parseInt(name[name.length - 1], 10);
            this.lines[name].material.linewidth = lineWidth * scale;
            this.lines[name].material.dashOffset -= 0.3;
        });
    }
    checkFinalStatus() {
        if (!this.perfInfo.layouting && this.currentPositionStatus && (this.currentPositionStatus[0] !== this.targetPositionStatus[0])) {
            this.currentPositionStatus = this.targetPositionStatus;
            this.updatePosition(this.currentPositionStatus);
            this.updateCirclesPosition(this.currentPositionStatus);
            this.updateArrowsPosition(this.currentPositionStatus);
            this.updateCallPerMinuteNumsPosition(this.currentPositionStatus);
            this.updateCallPerMinuteUnitsPosition(this.currentPositionStatus);
        }
    }
    filterNodes(typeArr) {
        let formatArr = [];
        for (let i = 0; i < typeArr.length; i++) {
            if (typeArr[i].toUpperCase() === 'MIDDLEWARE') {
                ['mq', 'database', 'cache'].forEach(val => formatArr.push(`${typeArr[i]}_${val}`.toUpperCase()));
            }
            formatArr.push(typeArr[i].toUpperCase());
        }
        this.darkenNodes(formatArr);
    }
    // 响应鼠标在图表上移动时的交互，指到某个节点上进行高亮
    updateHighLight() {
        let ray = new THREE.Raycaster();
        ray.setFromCamera(this.mouseStatus.mouseWorldPosition, this.camera);
        ray.params.Points.threshold = 2;
        let intersects = ray.intersectObjects(this.scene.children).filter(e => !e.object.name.startsWith('hl'));
        if (intersects.length > 0) {
            let object = intersects.filter(e => e.object.name.startsWith('basePoints'));
            let target = object.length > 0 ? object[0] : intersects[0];
            if (!target.object)
                return;
            let type = target.object.name.split('-')[0];
            let name = target.object.name.split('-')[1];
            if (type === 'basePoints') {
                this.highlightNodeType(name, target.index);
                this.mouseStatus.mouseDownNodeStatus = true;
            }
            if (type === 'baseLines' && name === 'CreateOn') {
                this.highlightLineType(name, target.faceIndex);
            }
            if (type === 'baseCircles') {
                this.highlightCircleType(target.index);
            }
        }
        else {
            this.unhighlight();
            this.mouseStatus.mouseDownNodeStatus = false;
        }
    }
    highlightNodeType(name, index) {
        let ray = new THREE.Raycaster();
        let nodeIndex = this.nodes[name].config.indexArr[index];
        let id = this.processedData.nodes[nodeIndex].id;
        let topoPosition = new THREE.Vector3(this.currentPositionStatus[nodeIndex * 2], this.currentPositionStatus[nodeIndex * 2 + 1], 0);
        let normalPosition = topoPosition.project(this.camera);
        ray.setFromCamera({ x: normalPosition.x, y: normalPosition.y }, this.camera);
        if (id && this.highlighted !== id) {
            this.unhighlight();
            ray.intersectObjects(this.scene.children).forEach((obj) => {
                let type = obj.object.name.split('-')[0];
                let name = obj.object.name.split('-')[1];
                if (type === 'basePoints') {
                    this.nodes[name].config.indexArr[obj.index] === nodeIndex
                        && this.hlNodes.push({ name: name, faceIndex: obj.index });
                }
                if (type === 'baseLines') {
                    let startNodeIndex = this.lines[name].config.indexArr[obj.faceIndex * 4];
                    let endNodeIndex = this.lines[name].config.indexArr[obj.faceIndex * 4 + 1];
                    let startNode = this.processedData.nodeInfoMap[this.processedData.nodes[startNodeIndex].id];
                    let endNode = this.processedData.nodeInfoMap[this.processedData.nodes[endNodeIndex].id];
                    let node = startNodeIndex === nodeIndex ? endNode : startNode;
                    this.hlNodes.push({ name: node.label, faceIndex: node.faceIndex });
                    this.hlLines.push({ name: name, faceIndex: obj.faceIndex });
                    this.hlArrows.push(this.lines[name].config.indexArr[obj.faceIndex * 4 + 2]);
                    this.hlCircles.push(this.lines[name].config.indexArr[obj.faceIndex * 4 + 3]);
                }
            });
            this.addHighLight();
            this.highlighted = id;
        }
    }
    highlightLineType(name, index) {
        let id = 'line-' + index;
        if (this.highlighted !== id) {
            this.unhighlight();
            let startNodeIndex = this.lines[name].config.indexArr[index * 4];
            let endNodeIndex = this.lines[name].config.indexArr[index * 4 + 1];
            let startNodeId = this.processedData.nodes[startNodeIndex].id;
            let endNodeId = this.processedData.nodes[endNodeIndex].id;
            let arrowIndex = this.lines[name].config.indexArr[index * 4 + 2];
            let circleIndex = this.lines[name].config.indexArr[index * 4 + 3];
            this.hlNodes.push({
                name: this.processedData.nodeInfoMap[startNodeId].label,
                faceIndex: this.processedData.nodeInfoMap[startNodeId].faceIndex
            });
            this.hlNodes.push({
                name: this.processedData.nodeInfoMap[endNodeId].label,
                faceIndex: this.processedData.nodeInfoMap[endNodeId].faceIndex
            });
            this.hlLines.push({ name: name, faceIndex: index });
            this.hlArrows.push(arrowIndex);
            this.hlCircles.push(circleIndex);
            let opacity = this.arrows.colors[arrowIndex * 4 + 3].toFixed(2) === DARK_OPACITY.toFixed(2)
                ? DARK_OPACITY : 0.8;
            this.addLineTextMesh(this.processedData.linkInfoMap[`${startNodeId}-${endNodeId}`], opacity);
            this.addHighLight();
            this.highlighted = id;
        }
    }
    highlightCircleType(index) {
        let id = 'circle-' + index;
        if (this.highlighted !== id) {
            this.unhighlight();
            let startNodeIndex = this.processedData.tracingToLinkBuffer[index * 5];
            let endNodeIndex = this.processedData.tracingToLinkBuffer[index * 5 + 1];
            let startNodeId = this.processedData.nodes[startNodeIndex].id;
            let endNodeId = this.processedData.nodes[endNodeIndex].id;
            let arrowIndex = this.processedData.tracingToLinkBuffer[index * 5 + 2];
            let lineIndex = this.processedData.tracingToLinkBuffer[index * 5 + 3];
            let name = 'TracingTo' + this.processedData.tracingToLinkBuffer[index * 5 + 4];
            this.hlNodes.push({
                name: this.processedData.nodeInfoMap[startNodeId].label,
                faceIndex: this.processedData.nodeInfoMap[startNodeId].faceIndex
            });
            this.hlNodes.push({
                name: this.processedData.nodeInfoMap[endNodeId].label,
                faceIndex: this.processedData.nodeInfoMap[endNodeId].faceIndex
            });
            this.hlLines.push({ name: name, faceIndex: lineIndex });
            this.hlArrows.push(arrowIndex);
            this.hlCircles.push(index);
            let opacity = this.arrows.colors[arrowIndex * 4 + 3].toFixed(2) === DARK_OPACITY.toFixed(2)
                ? DARK_OPACITY : 0.8;
            this.addLineTextMesh(this.processedData.linkInfoMap[`${startNodeId}-${endNodeId}`], opacity);
            this.addHighLight();
            this.highlighted = id;
        }
    }
    unhighlight() {
        let text = this.scene.getObjectByName('hlText');
        let lineInfoText = this.scene.getObjectByName('lineInfoText');
        this.scene.remove(text);
        this.scene.remove(lineInfoText);
        this.highlighted = null;
        this.$container.classList.remove('hl');
        this.highlightLines(false);
        this.highlightNodes(false);
        this.highlightArrows(false);
        this.highlightCircles(false);
        this.lineInfoText = null;
        this.hlLines = [];
        this.hlNodes = [];
        this.hlCircles = [];
        this.hlArrows = [];
        this.hlTexts = [];
    }
    resetAllMeshColor() {
        Object.keys(this.eventNodes).forEach(name => {
            this.eventNodes[name].colors = this.eventNodes[name].colors.map(() => 1);
        });
        Object.keys(this.lines).forEach(name => {
            this.lines[name].colors = this.lines[name].colors.map((val, index) => LINE_COLOR[index % 3]);
        });
        Object.keys(this.callPerMinuteNums).forEach(name => {
            this.callPerMinuteNums[name].colors = this.callPerMinuteNums[name].colors.map(() => 1);
        });
        this.callPerMinuteUnits.colors = this.callPerMinuteUnits.colors.map(() => 1);
        this.circles.colors = this.circles.colors.map((val, index) => index % 4 === 3 ? THEME_OPACITY : THEME_COLOR[index % 4]);
        this.arrows.colors = this.arrows.colors.map((val, index) => index % 4 === 3 ? THEME_OPACITY : THEME_COLOR[index % 4]);
    }
    darkenNodes(typeArr) {
        this.resetAllMeshColor();
        Object.keys(this.nodes).forEach(name => {
            this.nodes[name].colors =
                this.nodes[name].colors.map((val, index) => typeArr.indexOf(name) !== -1 && index % 4 === 3 ? DARK_OPACITY : 1);
        });
        typeArr.forEach(name => {
            if (!this.nodes[name])
                return;
            this.processedData.nodeTypeRelatedData[name].eventNodes.forEach((node) => {
                this.eventNodes[node.name].colors[node.faceIndex * 4 + 3] = DARK_OPACITY;
            });
            this.processedData.nodeTypeRelatedData[name].callPerMinuteNums.forEach((segment) => {
                this.callPerMinuteNums[segment.name].colors[segment.faceIndex * 4 + 3] = DARK_OPACITY;
            });
            this.processedData.nodeTypeRelatedData[name].lines.forEach((line) => {
                let name = line.name;
                let faceIndex = line.faceIndex;
                let item = this.lines[name];
                let indexArr = item.config.indexArr;
                item.colors[faceIndex * 6] = DARK_LINE_COLOR[0];
                item.colors[faceIndex * 6 + 1] = DARK_LINE_COLOR[1];
                item.colors[faceIndex * 6 + 2] = DARK_LINE_COLOR[2];
                item.colors[faceIndex * 6 + 3] = DARK_LINE_COLOR[0];
                item.colors[faceIndex * 6 + 4] = DARK_LINE_COLOR[1];
                item.colors[faceIndex * 6 + 5] = DARK_LINE_COLOR[2];
                this.arrows.colors[indexArr[faceIndex * 4 + 2] * 4 + 3] = DARK_OPACITY;
                this.circles.colors[indexArr[faceIndex * 4 + 3] * 4 + 3] = DARK_OPACITY;
                this.callPerMinuteUnits.colors[indexArr[faceIndex * 4 + 3] * 4 + 3] = DARK_OPACITY;
            });
        });
        Object.keys(this.nodes).forEach(name => {
            this.nodes[name].geometry.attributes.color = new THREE.BufferAttribute(this.nodes[name].colors, 4);
        });
        Object.keys(this.eventNodes).forEach(name => {
            this.eventNodes[name].geometry.attributes.color = new THREE.BufferAttribute(this.eventNodes[name].colors, 4);
        });
        Object.keys(this.callPerMinuteNums).forEach(name => {
            this.callPerMinuteNums[name].geometry.attributes.color = new THREE.BufferAttribute(this.callPerMinuteNums[name].colors, 4);
        });
        Object.keys(this.lines).forEach(name => {
            this.lines[name].geometry.setColors(this.lines[name].colors);
        });
        this.arrows.geometry.attributes.color = new THREE.BufferAttribute(this.arrows.colors, 4);
        this.circles.geometry.attributes.color = new THREE.BufferAttribute(this.circles.colors, 4);
        this.callPerMinuteUnits.geometry.attributes.color = new THREE.BufferAttribute(this.callPerMinuteUnits.colors, 4);
    }
    // 根据 id 高亮节点
    addHighLight() {
        this.highlightLines(true);
        this.highlightNodes(true);
        this.highlightArrows(true);
        this.highlightCircles(true);
        this.addHlTextsMesh();
        this.$container.classList.add('hl');
    }
    highlightNodes(isHighlight) {
        let color = isHighlight ? NODE_HL_COLOR : WHITE_COLOR;
        let nameMap = {};
        this.hlNodes.forEach(node => {
            let name = node.name;
            let faceIndex = node.faceIndex;
            let item = this.nodes[name];
            if (!nameMap[name])
                nameMap[name] = true;
            item.colors[faceIndex * 4] = color[0];
            item.colors[faceIndex * 4 + 1] = color[1];
            item.colors[faceIndex * 4 + 2] = color[2];
        });
        Object.keys(nameMap).forEach(name => {
            this.nodes[name].geometry.attributes.color = new THREE.BufferAttribute(this.nodes[name].colors, 4);
        });
    }
    highlightLines(isHighlight) {
        let nameMap = {};
        this.hlLines.forEach(line => {
            let name = line.name;
            let faceIndex = line.faceIndex;
            let item = this.lines[name];
            let lineColor = item.colors[faceIndex * 6].toFixed(2) === DARK_HL_COLOR[0].toFixed(2)
                ? DARK_LINE_COLOR : LINE_COLOR;
            let highlightColor = item.colors[faceIndex * 6].toFixed(2) === DARK_LINE_COLOR[0].toFixed(2)
                ? DARK_HL_COLOR : HL_COLOR;
            let color = isHighlight ? highlightColor : lineColor;
            if (!nameMap[name])
                nameMap[name] = true;
            item.colors[faceIndex * 6] = color[0];
            item.colors[faceIndex * 6 + 1] = color[1];
            item.colors[faceIndex * 6 + 2] = color[2];
            item.colors[faceIndex * 6 + 3] = color[0];
            item.colors[faceIndex * 6 + 4] = color[1];
            item.colors[faceIndex * 6 + 5] = color[2];
        });
        Object.keys(nameMap).forEach(name => {
            this.lines[name].geometry.setColors(this.lines[name].colors);
        });
    }
    highlightArrows(isHighlight) {
        let color = isHighlight ? HL_COLOR : THEME_COLOR;
        this.hlArrows.forEach(faceIndex => {
            if (faceIndex === -1)
                return;
            this.arrows.colors[faceIndex * 4] = color[0];
            this.arrows.colors[faceIndex * 4 + 1] = color[1];
            this.arrows.colors[faceIndex * 4 + 2] = color[2];
            this.arrows.colors[faceIndex * 4 + 3] =
                this.arrows.colors[faceIndex * 4 + 3].toFixed(1) === DARK_OPACITY.toFixed(1)
                    ? DARK_OPACITY
                    : (isHighlight ? 0.9 : THEME_OPACITY);
        });
        if (this.arrows.geometry) {
            this.arrows.geometry.attributes.color = new THREE.BufferAttribute(this.arrows.colors, 4);
        }
    }
    highlightCircles(isHighlight) {
        let color = isHighlight ? HL_COLOR : THEME_COLOR;
        this.hlCircles.forEach(faceIndex => {
            if (faceIndex === -1)
                return;
            this.circles.colors[faceIndex * 4] = color[0];
            this.circles.colors[faceIndex * 4 + 1] = color[1];
            this.circles.colors[faceIndex * 4 + 2] = color[2];
            this.circles.colors[faceIndex * 4 + 3] =
                this.circles.colors[faceIndex * 4 + 3].toFixed(1) === DARK_OPACITY.toFixed(1)
                    ? DARK_OPACITY
                    : (isHighlight ? 0.9 : THEME_OPACITY);
        });
        if (this.circles.geometry) {
            this.circles.geometry.attributes.color = new THREE.BufferAttribute(this.circles.colors, 4);
        }
    }
    addHlTextsMesh() {
        this.hlNodes.forEach(node => {
            let nodeIndex = this.nodes[node.name].config.indexArr[node.faceIndex];
            let text = this.processedData.nodes[nodeIndex].id;
            let hlText = { geometry: null, material: null, mesh: null };
            hlText.material = new THREE.MeshBasicMaterial({
                map: this.createTextTexture(text, 600, 72, 72),
                transparent: true,
                opacity: this.nodes[node.name].colors[node.faceIndex * 4 + 3],
                side: THREE.DoubleSide
            });
            let scale = 0.25;
            hlText.mesh = new THREE.Mesh(new THREE.PlaneGeometry(600 * scale, 72 * scale), hlText.material);
            let fontMeshPosition = [
                this.currentPositionStatus[nodeIndex * 2] + this.getOffset(this.config.nodeSize, 0) * 2,
                this.currentPositionStatus[nodeIndex * 2 + 1],
                0.001
            ];
            hlText.mesh.position.set(...fontMeshPosition);
            hlText.mesh.name = 'hlText';
            this.scene.add(hlText.mesh);
            this.hlTexts.push(hlText);
        });
    }
    addLineTextMesh(line, opacity) {
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');
        let scale;
        if (line.label === 'TracingTo') {
            canvas.width = 560;
            canvas.height = 260;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#252a2f';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = '50px Arial';
            ctx.fillStyle = '#a7aebb';
            ctx.fillText('链路类型: ', 10, 60);
            ctx.fillText('调用频率: ', 10, 150);
            ctx.fillText('平均响应时间: ', 10, 240);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('TracingTo', 250, 60);
            ctx.fillText(`${line.callPerMinute} 次/分钟`, 250, 150);
            ctx.fillText(`${line.callPerMinute} ms`, 350, 240);
        }
        else {
            canvas.width = 250;
            canvas.height = 80;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#252a2f';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = '50px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('CreateOn', 10, 60);
        }
        let texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        this.lineInfoText = {
            geometry: null,
            material: null,
            mesh: null,
            positions: new Float32Array(4)
        };
        this.lineInfoText.material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: opacity
        });
        let sourceIndex = this.processedData.nodeInfoMap[line.source].index;
        let targetIndex = this.processedData.nodeInfoMap[line.target].index;
        this.lineInfoText.positions[0] = sourceIndex;
        this.lineInfoText.positions[1] = targetIndex;
        this.lineInfoText.positions[2] = canvas.width * 0.06;
        this.lineInfoText.positions[3] = canvas.height * 0.06;
        this.lineInfoText.geometry = new THREE.PlaneGeometry(this.lineInfoText.positions[2], this.lineInfoText.positions[3]);
        this.lineInfoText.mesh = new THREE.Mesh(this.lineInfoText.geometry, this.lineInfoText.material);
        this.updateLineInfoText();
        this.lineInfoText.mesh.name = 'lineInfoText';
        this.scene.add(this.lineInfoText.mesh);
    }
    updateLineInfoText() {
        let scale = this.camera.position.z / this.getPositionZ(2);
        this.lineInfoText.mesh.scale.set(scale, scale, scale);
        let fontMeshPosition = [
            (this.currentPositionStatus[this.lineInfoText.positions[0] * 2]
                + this.currentPositionStatus[this.lineInfoText.positions[1] * 2]
                + this.lineInfoText.positions[2] * scale) / 2,
            (this.currentPositionStatus[this.lineInfoText.positions[0] * 2 + 1]
                + this.currentPositionStatus[this.lineInfoText.positions[1] * 2 + 1]
                + this.lineInfoText.positions[3] * scale) / 2,
            0.002
        ];
        this.lineInfoText.mesh.position.set(...fontMeshPosition);
    }
    refreshMouseStatus(event) {
        this.mouseStatus.mousePosition.x = event.clientX - this.containerRect.left - this.config.width / 2;
        this.mouseStatus.mousePosition.y = this.config.height - event.clientY + this.containerRect.top - this.config.height / 2;
        this.mouseStatus.mouseWorldPosition.x = this.mouseStatus.mousePosition.x * 2 / this.config.width;
        this.mouseStatus.mouseWorldPosition.y = this.mouseStatus.mousePosition.y * 2 / this.config.height;
    }
    mouseMoveHandler(event) {
        this.refreshMouseStatus(event);
    }
    mouseOutHandler() {
        this.mouseStatus.mouseOnChart = false;
        this.mouseStatus.mousePosition.x = -9999;
        this.mouseStatus.mousePosition.y = -9999;
    }
    mouseDownHandler(event) {
        console.log('down');
        this.refreshMouseStatus(event);
        this.mouseStatus.mouseDownStatus = true;
    }
    mouseUpHandler() {
        console.log('up');
        this.mouseStatus.mouseDownStatus = false;
        this.mouseStatus.mouseDownNodeStatus = false;
        // this.controls.enablePan = true
    }
    mouseWheelHandler(event) {
        let vector = new THREE.Vector3(this.mouseStatus.mouseWorldPosition.x, this.mouseStatus.mouseWorldPosition.y, 0.1)
            .unproject(this.camera)
            .sub(this.camera.position)
            .setLength(this.config.zoomScale * this.camera.position.z / 200);
        let zoom;
        if (event.deltaY < 0) {
            if (this.camera.position.z <= this.config.zoomNear)
                return;
            zoom = this.camera.position.z + vector.z;
            zoom < this.config.zoomNear
                && vector.multiplyScalar((this.camera.position.z - this.config.zoomNear - 1) / Math.abs(vector.z));
            this.camera.position.add(vector);
            this.controls.target.add(vector);
        }
        else {
            if (this.camera.position.z >= this.config.zoomFar)
                return;
            zoom = this.camera.position.z - vector.z;
            zoom > this.config.zoomFar
                && vector.multiplyScalar((this.config.zoomFar - this.camera.position.z - 1) / Math.abs(vector.z));
            this.camera.position.sub(vector);
            this.controls.target.sub(vector);
        }
        if (this.lineInfoText)
            this.updateLineInfoText();
    }
    chartMouseEnterHandler() {
        this.mouseStatus.mouseOnChart = true;
        clearTimeout(this.throttleTimer);
        this.throttleTimer = null;
        // 开启渲染
        // this.startRender()
    }
    chartMouseLeaveHandler() {
        this.mouseStatus.mouseOnChart = false;
        // 关闭渲染
        // if(!this.perfInfo.layouting && !this.lockHighlightToken) {
        //   this.stopRender()
        // }
    }
    // 绑定事件
    bindEvent() {
        this.$container.addEventListener('mousemove', this.mouseMoveHandlerBinded);
        this.$container.addEventListener('mousedown', this.mouseDownHandlerBinded);
        this.$container.addEventListener('mouseup', this.mouseUpHandlerBinded);
        this.$container.addEventListener('wheel', this.mouseWheelHandlerBinded);
    }
    // 解绑事件
    unbindEvent() {
        this.$container.removeEventListener('mousemove', this.mouseMoveHandlerBinded);
        this.$container.removeEventListener('mousedown', this.mouseDownHandlerBinded);
        this.$container.removeEventListener('mouseup', this.mouseUpHandlerBinded);
        this.$container.removeEventListener('wheel', this.mouseWheelHandlerBinded);
    }
    destroy() {
        this.stopRender();
        this.unbindEvent();
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.targetPositionStatus = null;
        this.currentPositionStatus = null;
        this.cachePositionStatus = null;
        this.processedData = null;
        this.perfInfo = null;
        this.data = null;
        this.nodes = {};
        this.lines = {};
        this.hlLines = [];
        this.hlNodes = [];
        this.hlArrows = [];
        this.hlCircles = [];
        this.hlTexts = [];
        this.circles = {
            geometry: null,
            positions: null,
            material: null,
            mesh: null
        };
        this.arrows = {
            geometry: null,
            positions: null,
            material: null,
            mesh: null
        };
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        this.$container = null;
        this.renderer = null;
    }
    resize(width, height) {
        this.camera.aspect = width / height;
        // this.config.width = width
        // this.config.height = height
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.renderer.render(this.scene, this.camera);
    }
    getOffset(size1, size2) {
        let realSize1 = size1 / this.distanceVector.length();
        let realSize2 = size2 / this.distanceVector.length();
        let distance = (realSize1 + realSize2) / this.config.width;
        let vector = new THREE.Vector4(0, 0, 0, 1)
            .applyMatrix4(this.modelViewMatrix)
            .applyMatrix4(this.projectionMatrix);
        let mouseVector = new THREE.Vector4(distance * vector.w, 0, vector.z, 1);
        let topoMouse = mouseVector
            .applyMatrix4(this.projectionMatrix.clone().invert())
            .applyMatrix4(this.modelViewMatrix.clone().invert());
        return topoMouse.x;
    }
    createTextTexture(text, width, height, fontSize) {
        if (text.length > 6)
            text = text.slice(0, 6) + '..';
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = `Bold ${fontSize}px Arial`;
        ctx.fillStyle = 'rgb(204, 204, 204)';
        ctx.fillText(text, width / 2, height / 2 + fontSize / 4);
        let fontTexture = new THREE.Texture(canvas);
        fontTexture.needsUpdate = true;
        return fontTexture;
    }
    getLineWidth(speed) {
        if (speed < 50) {
            return 1;
        }
        else if (speed < 100) {
            return 3;
        }
        else if (speed < 500) {
            return 5;
        }
        else {
            return 7;
        }
    }
    getEventLabel(event) {
        if (event < 10)
            return '';
        if (event <= 20)
            return 'event_warning';
        return 'event_critical';
    }
    getNodeLabel(type, middleWareType) {
        if (!middleWareType)
            return type.toUpperCase();
        return (type + '_' + middleWareType).toUpperCase();
    }
    // Fitting equation (Four Parameter Logistic Regression)
    // nodesCount: 14,969,11007,50002
    // z: 500,3000,7500,16000
    // nodesCount: 14,764,11007,50002
    // COL: 2,2.5,3.5,5
    // DISTANCE: 20,25,40,50
    // STRENGTH: 3,5,8,10
    getPositionZ(nodesCount) {
        return (3.04139028390183E+16 - 150.128392537138) / (1 + Math.pow(nodesCount / 2.12316143430556E+31, -0.461309470817812));
    }
    getDistance(nodesCount) {
        return (60.5026920478786 - 19.6364818002641) / (1 + Math.pow(nodesCount / 11113.7184968341, -0.705912886177758)) + 19.6364818002641;
    }
    getStrength(nodesCount) {
        return -1 * ((15.0568640234622 - 2.43316256810301) / (1 + Math.pow(nodesCount / 19283.3978670675, -0.422985777119439)) + 2.43316256810301);
    }
    getCol(nodesCount) {
        return (2148936082128.1 - 1.89052009608515) / (1 + Math.pow(nodesCount / 7.81339751933109E+33, -0.405575129002072)) + 1.89052009608515;
    }
    // 获取当前 viewport 下所以可视的节点
    getAllVisibleNodes() {
        let viewportRect = this.getViewPortRect();
        let result = [];
        for (let i = 0, len = this.perfInfo.nodeCounts; i < len; i++) {
            if (this.targetPositionStatus[i * 2] >= viewportRect.left && this.targetPositionStatus[i * 2] <= viewportRect.right && this.targetPositionStatus[i * 2 + 1] >= viewportRect.bottom && this.targetPositionStatus[i * 2 + 1] <= viewportRect.top) {
                result.push({
                    id: this.processedData.nodes[i].id,
                    x: this.targetPositionStatus[i * 2],
                    y: this.targetPositionStatus[i * 2 + 1]
                });
            }
        }
        return result;
    }
    // 根据透视投影模型，计算当前可视区域
    getViewPortRect() {
        let offsetY = this.camera.position.z * Math.tan(Math.PI / 180 * 22.5);
        let offsetX = offsetY * this.camera.aspect;
        return {
            left: this.camera.position.x - offsetX,
            right: this.camera.position.x + offsetX,
            top: this.camera.position.y + offsetY,
            bottom: this.camera.position.y - offsetY
        };
    }
}
exports.D3ForceGraph = D3ForceGraph;

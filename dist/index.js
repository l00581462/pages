"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const THREE = require("three");
const OrbitControls_1 = require("three/examples/jsm/controls/OrbitControls");
const LineSegmentsGeometry_1 = require("three/examples/jsm/lines/LineSegmentsGeometry");
const LineSegments2_1 = require("three/examples/jsm/lines/LineSegments2");
const LineMaterial_1 = require("three/examples/jsm/lines/LineMaterial");
const svgLoader_1 = require("./svgLoader");
const v3 = require("v3js");
const worker = require("./worker.js");
const arrowsVS = require("./shaders/arrows.vs");
const arrowsFS = require("./shaders/arrows.fs");
const textFS = require("./shaders/text.fs");
const textVS = require("./shaders/text.vs");
const mitt_1 = require("mitt");
require("./index.css");
const textureLoader = new THREE.TextureLoader();
const textureMap = new svgLoader_1.SvgLoader().result;
const GRAPH_BASE_CONFIG = {
    width: 400,
    height: 400,
    nodeSize: 35,
    eventNodeSize: 15,
    themeColor: [33 / 255, 126 / 255, 242 / 255],
    nodeColor: [1, 1, 1],
    lineColor: [44.286 / 255, 103.625 / 255, 130.394 / 255],
    highLightColor: [1, 1, 0],
    backgroundColor: [51 / 255, 56 / 255, 64 / 255],
    dashSize: 5,
    gapSize: 3,
    dashScale: 1,
    lineWidth: 1,
    showStatTable: true,
    zoomNear: 75,
    zoomFar: 17000,
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
            mousePosition: new THREE.Vector2(-9999, -9999)
        };
        this.nodes = {};
        this.eventNodes = {};
        this.lines = {};
        this.circles = {
            geometry: null,
            material: null,
            mesh: null,
            positions: null
        };
        this.arrows = {
            geometry: null,
            material: null,
            rotates: null,
            mesh: null,
            positions: null
        };
        this.speedUnits = {
            geometry: null,
            material: null,
            rotates: null,
            mesh: null,
            positions: null
        };
        this.hlNodes = [];
        this.hlLines = [];
        this.hlText = {
            geometry: null,
            material: null,
            mesh: null
        };
        this.mouseMoveHandlerBinded = this.mouseMoveHandler.bind(this);
        this.mouseOutHandlerBinded = this.mouseOutHandler.bind(this);
        this.chartMouseEnterHandlerBinded = this.chartMouseEnterHandler.bind(this);
        this.chartMouseLeaveHandlerBinded = this.chartMouseLeaveHandler.bind(this);
        this.$container = dom;
        this.data = data;
        this.config = Object.assign({}, GRAPH_BASE_CONFIG, graphBaseConfig);
        this.perfInfo = GRAPH_DEFAULT_PERF_INFO;
        this.events = new mitt_1.default();
        this.init();
    }
    init() {
        try {
            this.processedData = this.preProcessData();
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
    /**
     * preProcessData
     * preprocess data
     *
     * @returns {ProcessedData}
     * @memberof D3ForceGraph
     */
    preProcessData() {
        let result = {
            nodes: [],
            links: [],
            nodeInfoMap: {},
            linkInfoMap: {},
            statTable: [],
            linkBuffer: null,
            tracingToLinkBuffer: null
        };
        let nodeCount = 0;
        this.data.nodes.forEach(e => {
            if (!result.nodeInfoMap[e.id]) {
                result.nodes.push({
                    id: e.id
                });
                result.nodeInfoMap[e.id] = {
                    index: nodeCount,
                    image: e.image,
                    event: e.event,
                    middleWareType: e.middleWareType,
                    name: e.name
                };
                let nodeType = this.getNodeType(e.image, e.middleWareType);
                if (!this.nodes[nodeType]) {
                    this.nodes[nodeType] = {
                        config: {
                            map: textureLoader.load(textureMap[nodeType.toUpperCase()]),
                            count: 1,
                            indexArr: [nodeCount]
                        },
                        material: null,
                        positions: null,
                        geometry: null,
                        mesh: null,
                        colors: null
                    };
                }
                else {
                    this.nodes[nodeType].config.count++;
                    this.nodes[nodeType].config.indexArr.push(nodeCount);
                }
                let eventType = this.getEventType(e.event);
                if (eventType) {
                    if (!this.eventNodes[eventType]) {
                        this.eventNodes[eventType] = {
                            config: {
                                map: textureLoader.load(textureMap[eventType.toUpperCase()]),
                                count: 1,
                                indexArr: [nodeCount]
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
                        this.eventNodes[eventType].config.indexArr.push(nodeCount);
                    }
                }
                nodeCount++;
            }
        });
        let linkCountMap = {};
        let linkBuffer = [];
        let tracingToLinkBuffer = [];
        this.data.links.forEach(e => {
            if (e.source === e.target)
                return;
            let linkInfoKey = `${e.source}-${e.target}`;
            if (!result.linkInfoMap[linkInfoKey]) {
                result.links.push({
                    source: e.source,
                    target: e.target
                });
                linkBuffer.push(result.nodeInfoMap[e.source].index, result.nodeInfoMap[e.target].index);
                result.linkInfoMap[linkInfoKey] = {
                    lineType: e.lineType,
                    speed: e.speed
                };
                linkCountMap[e.source] = (linkCountMap[e.source] || 0) + 1;
                let lineWidth;
                let lineType;
                let dashed;
                if (e.lineType === 'createOn') {
                    lineWidth = this.config.lineWidth;
                    lineType = e.lineType;
                    dashed = false;
                }
                else {
                    lineWidth = this.getLineWidth(e.speed);
                    lineType = 'tracingTo' + lineWidth;
                    dashed = true;
                    this.perfInfo.tracingToLinkCounts++;
                    tracingToLinkBuffer.push(result.nodeInfoMap[e.source].index, result.nodeInfoMap[e.target].index);
                }
                if (!this.lines[lineType]) {
                    this.lines[lineType] = {
                        config: {
                            lineWidth: lineWidth,
                            count: 1,
                            dashed: dashed,
                            indexArr: [result.nodeInfoMap[e.source].index, result.nodeInfoMap[e.target].index]
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
                    this.lines[lineType].config.indexArr.push(result.nodeInfoMap[e.source].index, result.nodeInfoMap[e.target].index);
                }
            }
        });
        result.linkBuffer = new Int32Array(linkBuffer);
        result.tracingToLinkBuffer = new Int32Array(tracingToLinkBuffer);
        result.statTable = Object.keys(linkCountMap).map(e => {
            return {
                source: e,
                count: linkCountMap[e]
            };
        }).sort((a, b) => {
            return b.count - a.count;
        });
        if (result.statTable.length > 20) {
            result.statTable.length = 20;
        }
        return result;
    }
    getLineWidth(speed) {
        // if(speed < 10){
        //   return 1
        // }else if(speed < 100) {
        //   return 2
        // }else if(speed < 1000) {
        //   return 3
        // }else {
        //   return 4
        // }
        return 1;
    }
    getEventType(event) {
        if (event < 10)
            return '';
        if (event <= 20)
            return 'event_warning';
        return 'event_critical';
    }
    getNodeType(type, middleWareType) {
        if (!middleWareType)
            return type;
        return type + '_' + middleWareType;
    }
    prepareScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(...this.config.backgroundColor);
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            logarithmicDepthBuffer: true
        });
        this.renderer.setSize(this.config.width, this.config.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.$container.appendChild(this.renderer.domElement);
        this.camera = new THREE.PerspectiveCamera(45, this.config.width / this.config.height, 40, 18000);
        this.camera.position.set(0, 0, this.getPositionZ(this.processedData.nodes.length));
        this.camera.up = new THREE.Vector3(0, 0, 1);
        this.camera.updateProjectionMatrix();
        this.renderer.render(this.scene, this.camera);
        this.containerRect = this.$container.getBoundingClientRect();
        this.$container.classList.add('d3-force-graph-container');
    }
    prepareBasicMesh() {
        this.perfInfo.layoutStartTime = Date.now();
        Object.keys(this.nodes).forEach((name) => {
            this.prepareNodeMesh(name, this.nodes[name].config);
        });
        Object.keys(this.eventNodes).forEach((name) => {
            this.prepareEventNodeMesh(name, this.eventNodes[name].config);
        });
        Object.keys(this.lines).forEach((name) => {
            this.prepareLineMesh(name, this.lines[name].config);
        });
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
    prepareNodeMesh(name, nodeConfig) {
        this.nodes[name].geometry = new THREE.BufferGeometry();
        this.nodes[name].positions = new Float32Array(nodeConfig.count * 3);
        this.nodes[name].colors = new Float32Array(nodeConfig.count * 3);
        this.nodes[name].material = new THREE.PointsMaterial({
            opacity: 0.99,
            vertexColors: true,
            map: nodeConfig.map,
            size: this.config.nodeSize,
            transparent: true,
            depthTest: false // 解决透明度问题
        });
        this.processedData.nodes.forEach((e, i) => {
            this.nodes[name].positions[i * 3] = -9999;
            this.nodes[name].positions[i * 3 + 1] = -9999;
            this.nodes[name].positions[i * 3 + 2] = 0;
            this.nodes[name].colors[i * 3] = this.config.nodeColor[0];
            this.nodes[name].colors[i * 3 + 1] = this.config.nodeColor[1];
            this.nodes[name].colors[i * 3 + 2] = this.config.nodeColor[2];
        });
        this.nodes[name].geometry.setAttribute('position', new THREE.BufferAttribute(this.nodes[name].positions, 3));
        this.nodes[name].geometry.setAttribute('color', new THREE.BufferAttribute(this.nodes[name].colors, 3));
        this.nodes[name].geometry.computeBoundingSphere();
        this.nodes[name].mesh = new THREE.Points(this.nodes[name].geometry, this.nodes[name].material);
        this.nodes[name].mesh.name = 'basePoints-' + name;
        this.scene.add(this.nodes[name].mesh);
    }
    prepareEventNodeMesh(name, nodeConfig) {
        this.eventNodes[name].geometry = new THREE.BufferGeometry();
        this.eventNodes[name].positions = new Float32Array(nodeConfig.count * 3);
        this.eventNodes[name].colors = new Float32Array(nodeConfig.count * 3);
        this.eventNodes[name].material = new THREE.PointsMaterial({
            // opacity: 0.99,
            vertexColors: true,
            map: nodeConfig.map,
            size: this.config.eventNodeSize,
            transparent: true,
            depthTest: false // 解决透明度问题
        });
        this.processedData.nodes.forEach((e, i) => {
            this.eventNodes[name].positions[i * 3] = -9999;
            this.eventNodes[name].positions[i * 3 + 1] = -9999;
            this.eventNodes[name].positions[i * 3 + 2] = 0;
            this.eventNodes[name].colors[i * 3] = this.config.nodeColor[0];
            this.eventNodes[name].colors[i * 3 + 1] = this.config.nodeColor[1];
            this.eventNodes[name].colors[i * 3 + 2] = this.config.nodeColor[2];
        });
        this.eventNodes[name].geometry.setAttribute('position', new THREE.BufferAttribute(this.eventNodes[name].positions, 3));
        this.eventNodes[name].geometry.setAttribute('color', new THREE.BufferAttribute(this.eventNodes[name].colors, 3));
        this.eventNodes[name].geometry.computeBoundingSphere();
        this.eventNodes[name].mesh = new THREE.Points(this.eventNodes[name].geometry, this.eventNodes[name].material);
        this.eventNodes[name].mesh.name = 'baseEventPoints-' + name;
        this.scene.add(this.eventNodes[name].mesh);
    }
    prepareLineMesh(name, linkConfig) {
        this.lines[name].geometry = new LineSegmentsGeometry_1.LineSegmentsGeometry();
        this.lines[name].positions = new Float32Array(linkConfig.count * 6);
        this.lines[name].colors = new Float32Array(linkConfig.count * 6);
        this.lines[name].material = new LineMaterial_1.LineMaterial({
            linewidth: linkConfig.lineWidth,
            dashed: linkConfig.dashed,
            vertexColors: true,
            dashSize: this.config.dashSize,
            gapSize: this.config.gapSize,
            dashScale: this.config.dashScale
        });
        if (linkConfig.dashed)
            this.lines[name].material.defines.USE_DASH = '';
        this.lines[name].material.resolution = new THREE.Vector2(this.config.width, this.config.height);
        this.processedData.links.forEach((e, i) => {
            this.lines[name].positions[i * 6] = -9999;
            this.lines[name].positions[i * 6 + 1] = -9999;
            this.lines[name].positions[i * 6 + 2] = -0.01;
            this.lines[name].positions[i * 6 + 3] = -9999;
            this.lines[name].positions[i * 6 + 4] = -9999;
            this.lines[name].positions[i * 6 + 5] = -0.01;
            this.lines[name].colors[i * 6] = this.config.lineColor[0];
            this.lines[name].colors[i * 6 + 1] = this.config.lineColor[1];
            this.lines[name].colors[i * 6 + 2] = this.config.lineColor[2];
            this.lines[name].colors[i * 6 + 3] = this.config.lineColor[0];
            this.lines[name].colors[i * 6 + 4] = this.config.lineColor[1];
            this.lines[name].colors[i * 6 + 5] = this.config.lineColor[2];
        });
        this.lines[name].geometry.setPositions(this.lines[name].positions);
        this.lines[name].geometry.setColors(this.lines[name].colors);
        this.lines[name].mesh = new LineSegments2_1.LineSegments2(this.lines[name].geometry, this.lines[name].material);
        this.lines[name].mesh.computeLineDistances();
        this.lines[name].mesh.name = 'baseLines-' + name;
        this.scene.add(this.lines[name].mesh);
    }
    prepareCircleMesh() {
        this.circles.geometry = new THREE.BufferGeometry();
        this.circles.positions = new Float32Array(this.perfInfo.tracingToLinkCounts * 3);
        this.circles.material = new THREE.PointsMaterial({
            size: this.config.nodeSize / 3,
            map: textureLoader.load(textureMap['circle'.toUpperCase()]),
            color: new THREE.Color(...this.config.themeColor),
            opacity: 0.373,
            transparent: true,
            depthTest: false
        });
        this.circles.material.map.needsUpdate = true;
        for (let i = 0; i < this.perfInfo.tracingToLinkCounts; i++) {
            this.circles.positions[i * 3] = -9999;
            this.circles.positions[i * 3 + 1] = -9999;
            this.circles.positions[i * 3 + 2] = -0.006;
        }
        this.circles.geometry.setAttribute('position', new THREE.BufferAttribute(this.circles.positions, 3));
        this.circles.geometry.computeBoundingSphere();
        this.circles.mesh = new THREE.Points(this.circles.geometry, this.circles.material);
        this.circles.mesh.name = 'baseCircles';
        this.scene.add(this.circles.mesh);
    }
    prepareArrowMesh() {
        this.arrows.geometry = new THREE.BufferGeometry();
        this.arrows.positions = new Float32Array(this.perfInfo.linkCounts * 3);
        this.arrows.rotates = new Float32Array(this.perfInfo.linkCounts);
        this.arrows.material = new THREE.ShaderMaterial({
            transparent: true,
            uniforms: {
                map: { value: textureLoader.load(textureMap['arrow'.toUpperCase()]) },
                size: { value: this.config.nodeSize * 0.75 * 320 },
                color: { value: new THREE.Vector3(...this.config.themeColor) }
            },
            vertexShader: arrowsVS(),
            fragmentShader: arrowsFS()
        });
        for (let i = 0; i < this.perfInfo.linkCounts; i++) {
            this.arrows.positions[i * 3] = -9999;
            this.arrows.positions[i * 3 + 1] = -9999;
            this.arrows.positions[i * 3 + 2] = -0.006;
            this.arrows.rotates[i] = 0;
        }
        this.arrows.geometry.setAttribute('position', new THREE.BufferAttribute(this.arrows.positions, 3));
        this.arrows.geometry.setAttribute('rotate', new THREE.BufferAttribute(this.arrows.rotates, 1));
        this.arrows.geometry.computeBoundingSphere();
        this.arrows.mesh = new THREE.Points(this.arrows.geometry, this.arrows.material);
        this.arrows.mesh.name = 'arrows';
        this.scene.add(this.arrows.mesh);
    }
    prepareSpeedUnitMesh() {
        this.speedUnits.geometry = new THREE.BufferGeometry();
        this.speedUnits.positions = new Float32Array(this.perfInfo.tracingToLinkCounts * 3);
        this.speedUnits.rotates = new Float32Array(this.perfInfo.tracingToLinkCounts);
        this.speedUnits.material = new THREE.ShaderMaterial({
            transparent: true,
            uniforms: {
                map: { value: this.createTextTexture('r/min', 1000, 800, 160) },
                size: { value: this.config.nodeSize * 500 },
                color: { value: new THREE.Vector3(1, 1, 1) }
            },
            vertexShader: textVS(),
            fragmentShader: textFS()
        });
        for (let i = 0; i < this.perfInfo.tracingToLinkCounts; i++) {
            this.speedUnits.positions[i * 3] = -9999;
            this.speedUnits.positions[i * 3 + 1] = -9999;
            this.speedUnits.positions[i * 3 + 2] = 0;
            this.speedUnits.rotates[i] = 0;
        }
        this.speedUnits.geometry.setAttribute('position', new THREE.BufferAttribute(this.speedUnits.positions, 3));
        this.speedUnits.geometry.setAttribute('rotate', new THREE.BufferAttribute(this.speedUnits.rotates, 1));
        this.speedUnits.geometry.computeBoundingSphere();
        this.speedUnits.mesh = new THREE.Points(this.speedUnits.geometry, this.speedUnits.material);
        this.speedUnits.mesh.name = 'speedUnits';
        this.scene.add(this.speedUnits.mesh);
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
                    this.$container.addEventListener('mousemove', this.mouseMoveHandlerBinded, false);
                    this.$container.addEventListener('mouseout', this.mouseOutHandlerBinded, false);
                    break;
                }
            }
        };
    }
    installControls() {
        this.controls = new OrbitControls_1.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = false;
        this.controls.enableRotate = false;
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
        if (this.camera.position.z < this.config.zoomNear) {
            this.camera.position.set(this.camera.position.x, this.camera.position.y, this.config.zoomNear);
        }
        if (this.camera.position.z > this.config.zoomFar) {
            this.camera.position.set(this.camera.position.x, this.camera.position.y, this.config.zoomFar);
        }
        this.perfInfo.layouting && this.renderTopo();
        !this.perfInfo.layouting && this.renderLineAnimation();
        this.checkFinalStatus();
        this.updateHighLight();
        this.renderer.render(this.scene, this.camera);
        this.controls && this.controls.update();
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
                Object.keys(this.nodes).forEach((name) => {
                    this.updateNodePosition(name, this.currentPositionStatus);
                });
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
        Object.keys(this.lines).forEach((name) => {
            this.lines[name].material.dashOffset -= 0.2;
        });
    }
    checkFinalStatus() {
        if (!this.perfInfo.layouting && this.currentPositionStatus && (this.currentPositionStatus[0] !== this.targetPositionStatus[0])) {
            this.currentPositionStatus = this.targetPositionStatus;
            this.updatePosition(this.currentPositionStatus);
            this.updateCirclePosition(this.currentPositionStatus);
            this.updateArrowPosition(this.currentPositionStatus);
            this.updateSpeedUnitPosition(this.currentPositionStatus);
        }
    }
    // 更新节点与线的位置
    updatePosition(nodesPosition) {
        Object.keys(this.nodes).forEach((name) => {
            this.updateNodePosition(name, nodesPosition);
        });
        Object.keys(this.eventNodes).forEach((name) => {
            this.updateEventNodePosition(name, nodesPosition);
        });
        Object.keys(this.lines).forEach((name) => {
            this.updateLinePosition(name, nodesPosition);
        });
    }
    updateNodePosition(name, nodesPosition) {
        let nodeConfig = this.nodes[name].config;
        for (let i = 0; i < nodeConfig.count; i++) {
            this.nodes[name].positions[i * 3] = nodesPosition[nodeConfig.indexArr[i] * 2];
            this.nodes[name].positions[i * 3 + 1] = nodesPosition[nodeConfig.indexArr[i] * 2 + 1];
        }
        this.nodes[name].geometry.attributes.position = new THREE.BufferAttribute(this.nodes[name].positions, 3);
        this.nodes[name].geometry.computeBoundingSphere();
    }
    updateEventNodePosition(name, nodesPosition) {
        let nodeConfig = this.eventNodes[name].config;
        let offset = (this.config.nodeSize + this.config.eventNodeSize) / (2 * 3.5);
        for (let i = 0; i < nodeConfig.count; i++) {
            this.eventNodes[name].positions[i * 3] = nodesPosition[nodeConfig.indexArr[i] * 2] + offset;
            this.eventNodes[name].positions[i * 3 + 1] = nodesPosition[nodeConfig.indexArr[i] * 2 + 1] + offset;
        }
        this.eventNodes[name].geometry.attributes.position = new THREE.BufferAttribute(this.eventNodes[name].positions, 3);
        this.eventNodes[name].geometry.computeBoundingSphere();
    }
    updateLinePosition(name, nodesPosition) {
        let lineConfig = this.lines[name].config;
        for (let i = 0; i < lineConfig.count; i++) {
            this.lines[name].positions[i * 6] = nodesPosition[lineConfig.indexArr[i * 2] * 2];
            this.lines[name].positions[i * 6 + 1] = nodesPosition[lineConfig.indexArr[i * 2] * 2 + 1];
            this.lines[name].positions[i * 6 + 3] = nodesPosition[lineConfig.indexArr[i * 2 + 1] * 2];
            this.lines[name].positions[i * 6 + 4] = nodesPosition[lineConfig.indexArr[i * 2 + 1] * 2 + 1];
        }
        this.lines[name].geometry.setPositions(this.lines[name].positions);
        this.lines[name].mesh.computeLineDistances();
    }
    updateCirclePosition(nodesPosition) {
        this.prepareCircleMesh();
        for (let i = 0; i < this.perfInfo.tracingToLinkCounts; i++) {
            this.circles.positions[i * 3] =
                (nodesPosition[this.processedData.tracingToLinkBuffer[i * 2] * 2] +
                    nodesPosition[this.processedData.tracingToLinkBuffer[i * 2 + 1] * 2]) / 2;
            this.circles.positions[i * 3 + 1] =
                (nodesPosition[this.processedData.tracingToLinkBuffer[i * 2] * 2 + 1] +
                    nodesPosition[this.processedData.tracingToLinkBuffer[i * 2 + 1] * 2 + 1]) / 2;
        }
        this.circles.geometry.attributes.position = new THREE.BufferAttribute(this.circles.positions, 3);
        this.circles.geometry.computeBoundingSphere();
    }
    updateSpeedUnitPosition(nodesPosition) {
        this.prepareSpeedUnitMesh();
        let vec = new v3.Vector3(0, 0, 0);
        let up = new v3.Vector3(1, 0, 0);
        let offsetDistance = 0.1 * (1 + 1 / 3) * this.config.nodeSize;
        for (let i = 0; i < this.perfInfo.tracingToLinkCounts; i++) {
            // 计算箭头的旋转方向与偏移位置
            let vecX = nodesPosition[this.processedData.tracingToLinkBuffer[i * 2 + 1] * 2] -
                nodesPosition[this.processedData.tracingToLinkBuffer[i * 2] * 2];
            let vecY = nodesPosition[this.processedData.tracingToLinkBuffer[i * 2 + 1] * 2 + 1] -
                nodesPosition[this.processedData.tracingToLinkBuffer[i * 2] * 2 + 1];
            vec.x = vecX;
            vec.y = vecY;
            let angle = v3.Vector3.getAngle(vec, up);
            let vecNorm = v3.Vector3.getNorm(vec);
            let offsetX = vecX * offsetDistance / vecNorm;
            let offsetY = vecY * offsetDistance / vecNorm;
            if (vecY < 0) {
                angle = 2 * Math.PI - angle;
            }
            this.speedUnits.positions[i * 3] =
                (nodesPosition[this.processedData.tracingToLinkBuffer[i * 2] * 2] +
                    nodesPosition[this.processedData.tracingToLinkBuffer[i * 2 + 1] * 2]) / 2 - offsetY;
            this.speedUnits.positions[i * 3 + 1] =
                (nodesPosition[this.processedData.tracingToLinkBuffer[i * 2] * 2 + 1] +
                    nodesPosition[this.processedData.tracingToLinkBuffer[i * 2 + 1] * 2 + 1]) / 2 + offsetX;
            this.speedUnits.rotates[i] = angle;
        }
        this.speedUnits.geometry.attributes.position = new THREE.BufferAttribute(this.speedUnits.positions, 3);
        this.speedUnits.geometry.attributes.rotates = new THREE.BufferAttribute(this.speedUnits.rotates, 1);
        this.speedUnits.geometry.computeBoundingSphere();
    }
    updateArrowPosition(nodesPosition) {
        this.prepareArrowMesh();
        let vec = new v3.Vector3(0, 0, 0);
        let up = new v3.Vector3(1, 0, 0);
        let offsetDistance = 0.385 * this.config.nodeSize;
        for (let i = 0; i < this.perfInfo.linkCounts; i++) {
            // 计算箭头的旋转方向与偏移位置
            let vecX = nodesPosition[this.processedData.linkBuffer[i * 2 + 1] * 2] -
                nodesPosition[this.processedData.linkBuffer[i * 2] * 2];
            let vecY = nodesPosition[this.processedData.linkBuffer[i * 2 + 1] * 2 + 1] -
                nodesPosition[this.processedData.linkBuffer[i * 2] * 2 + 1];
            vec.x = vecX;
            vec.y = vecY;
            let angle = v3.Vector3.getAngle(vec, up);
            let vecNorm = v3.Vector3.getNorm(vec);
            let offsetX = vecX * offsetDistance / vecNorm;
            let offsetY = vecY * offsetDistance / vecNorm;
            if (vecY > 0) {
                angle = 2 * Math.PI - angle;
            }
            this.arrows.positions[i * 3] = nodesPosition[this.processedData.linkBuffer[i * 2 + 1] * 2] - offsetX;
            this.arrows.positions[i * 3 + 1] = nodesPosition[this.processedData.linkBuffer[i * 2 + 1] * 2 + 1] - offsetY;
            this.arrows.rotates[i] = angle;
        }
        this.arrows.geometry.attributes.position = new THREE.BufferAttribute(this.arrows.positions, 3);
        this.arrows.geometry.attributes.rotates = new THREE.BufferAttribute(this.arrows.rotates, 1);
        this.arrows.geometry.computeBoundingSphere();
    }
    // 响应鼠标在图表上移动时的交互，指到某个节点上进行高亮
    updateHighLight() {
        let normalMouse = new THREE.Vector2();
        normalMouse.x = this.mouseStatus.mousePosition.x * 2 / this.config.width;
        normalMouse.y = this.mouseStatus.mousePosition.y * 2 / this.config.height;
        let ray = new THREE.Raycaster();
        ray.setFromCamera(normalMouse, this.camera);
        ray.params.Points.threshold = 2;
        let intersects = ray.intersectObjects(this.scene.children).filter(e => !e.object.name.startsWith('hl'));
        if (intersects.length > 0) {
            let target = intersects[0];
            let id = '';
            if (!target.object)
                return;
            let name = target.object.name.split('-')[1];
            if (target.object.name.indexOf('basePoints') !== -1) {
                let nodeIndex = this.nodes[name].config.indexArr[target.index];
                id = this.processedData.nodes[nodeIndex].id;
                let topoPosition = new THREE.Vector3(this.currentPositionStatus[nodeIndex * 2], this.currentPositionStatus[nodeIndex * 2 + 1], 0);
                let normalPosition = topoPosition.project(this.camera);
                ray.setFromCamera({
                    x: normalPosition.x,
                    y: normalPosition.y
                }, this.camera);
                if (id && this.highlighted !== id) {
                    this.unhighlight();
                    ray.intersectObjects(this.scene.children).forEach((obj) => {
                        let type = obj.object.name.split('-')[0];
                        let name = obj.object.name.split('-')[1];
                        if (type === 'basePoints') {
                            let pointIndex = this.nodes[name].config.indexArr[obj.index];
                            pointIndex === nodeIndex && this.hlNodes.push({
                                name: name,
                                index: obj.index
                            }) && this.prepareHlTextsMesh(id);
                        }
                        else {
                            let startNodeIndex = this.lines[name].config.indexArr[obj.faceIndex * 2];
                            let endNodeIndex = this.lines[name].config.indexArr[obj.faceIndex * 2 + 1];
                            let startNode = this.processedData.nodeInfoMap[this.processedData.nodes[startNodeIndex].id];
                            let endNode = this.processedData.nodeInfoMap[this.processedData.nodes[endNodeIndex].id];
                            let node = startNodeIndex === nodeIndex ? endNode : startNode;
                            this.hlLines.push({ name: name, faceIndex: obj.faceIndex });
                            // this.hlNodes.push({ name: node.image, index: obj.faceIndex })
                        }
                    });
                    this.addHighLight();
                    this.highlighted = id;
                }
            }
        }
        else {
            if (!this.lockHighlightToken) {
                this.unhighlight();
            }
        }
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
    highlight(id) {
        if (this.highlighted !== id) {
            this.unhighlight();
            this.addHighLight();
            this.highlighted = id;
        }
    }
    unhighlight() {
        let node = this.scene.getObjectByName('hlNodes');
        let line = this.scene.getObjectByName('hlLines');
        let text = this.scene.getObjectByName('hlText');
        this.scene.remove(node);
        this.scene.remove(line);
        this.scene.remove(text);
        this.highlighted = null;
        this.$container.classList.remove('hl');
        this.highlightLines(false);
        this.highlightNodes(false);
        this.hlLines = [];
        this.hlNodes = [];
    }
    // 根据 id 高亮节点
    addHighLight() {
        this.highlightLines(true);
        this.highlightNodes(true);
        this.$container.classList.add('hl');
    }
    highlightNodes(isHighlight) {
        let color = isHighlight ? this.config.highLightColor : this.config.nodeColor;
        let nameMap = {};
        this.hlNodes.forEach(node => {
            let name = node.name;
            let index = node.index;
            if (!nameMap[name])
                nameMap[name] = true;
            this.nodes[name].colors[index * 3] = color[0];
            this.nodes[name].colors[index * 3 + 1] = color[1];
            this.nodes[name].colors[index * 3 + 2] = color[2];
        });
        Object.keys(nameMap).forEach(name => {
            this.nodes[name].geometry.setAttribute('color', new THREE.BufferAttribute(this.nodes[name].colors, 3));
        });
    }
    highlightLines(isHighlight) {
        let color = isHighlight ? this.config.highLightColor : this.config.lineColor;
        let nameMap = {};
        this.hlLines.forEach(line => {
            let name = line.name;
            let faceIndex = line.faceIndex;
            if (!nameMap[name])
                nameMap[name] = true;
            this.lines[name].colors[faceIndex * 6] = color[0];
            this.lines[name].colors[faceIndex * 6 + 1] = color[1];
            this.lines[name].colors[faceIndex * 6 + 2] = color[2];
            this.lines[name].colors[faceIndex * 6 + 3] = color[0];
            this.lines[name].colors[faceIndex * 6 + 4] = color[1];
            this.lines[name].colors[faceIndex * 6 + 5] = color[2];
        });
        Object.keys(nameMap).forEach(name => {
            this.lines[name].geometry.setColors(this.lines[name].colors);
        });
    }
    prepareHlTextsMesh(sourceId) {
        let text = sourceId.startsWith('null') ? 'null' : (this.processedData.nodeInfoMap[sourceId].name || sourceId);
        this.hlText.material = new THREE.MeshBasicMaterial({
            map: this.createTextTexture(text, 512, 64, 72),
            side: THREE.DoubleSide,
            alphaTest: 0.5
        });
        this.hlText.material.transparent = true;
        this.hlText.mesh = new THREE.Mesh(new THREE.PlaneGeometry(512, 64), this.hlText.material);
        this.hlText.mesh.scale.set(0.12, 0.12, 0.12);
        let fontMeshPosition = [
            this.currentPositionStatus[this.processedData.nodeInfoMap[sourceId].index * 2] + 25,
            this.currentPositionStatus[this.processedData.nodeInfoMap[sourceId].index * 2 + 1],
            0.02
        ];
        this.hlText.mesh.position.set(...fontMeshPosition);
        this.hlText.mesh.name = 'hlText';
        this.scene.add(this.hlText.mesh);
    }
    createTextTexture(text, width, height, fontSize) {
        let canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = `Bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgb(255,255,255)';
        ctx.fillText(text, canvas.width / 2 + fontSize * text.length / 4, canvas.height / 2 + fontSize / 4);
        let fontTexture = new THREE.Texture(canvas);
        fontTexture.needsUpdate = true;
        return fontTexture;
    }
    mouseMoveHandler(event) {
        this.mouseStatus.mouseOnChart = true;
        this.mouseStatus.mousePosition.x = event.clientX - this.containerRect.left - this.config.width / 2;
        this.mouseStatus.mousePosition.y = this.config.height - event.clientY + this.containerRect.top - this.config.height / 2;
    }
    mouseOutHandler() {
        this.mouseStatus.mouseOnChart = false;
        this.mouseStatus.mousePosition.x = -9999;
        this.mouseStatus.mousePosition.y = -9999;
    }
    chartMouseEnterHandler() {
        this.mouseStatus.mouseOnChart = true;
        clearTimeout(this.throttleTimer);
        this.throttleTimer = null;
        // 开启渲染
        this.startRender();
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
        this.$container.addEventListener('mouseenter', this.chartMouseEnterHandlerBinded);
        this.$container.addEventListener('mouseleave', this.chartMouseLeaveHandlerBinded);
    }
    // 解绑事件
    unbindEvent() {
        this.$container.removeEventListener('mouseenter', this.chartMouseEnterHandlerBinded);
        this.$container.removeEventListener('mouseleave', this.chartMouseLeaveHandlerBinded);
        this.$container.removeEventListener('mousemove', this.mouseMoveHandlerBinded);
        this.$container.removeEventListener('mouseout', this.mouseOutHandlerBinded);
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
        this.data = null;
        this.nodes = {};
        this.lines = {};
        this.hlLines = [];
        this.hlNodes = [];
        this.circles = {
            geometry: null,
            positions: null,
            material: null,
            mesh: null
        };
        this.hlText = {
            geometry: null,
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
    // Fitting equation (Four Parameter Logistic Regression)
    // nodesCount: 14,969,11007,50002
    // z: 500,3000,7500,16000
    // nodesCount: 14,764,11007,50002
    // COL: 2,2.5,3.5,5
    // DISTANCE: 20,25,40,50
    // STRENGTH: 3,5,8,10
    getPositionZ(nodesCount) {
        return (3.04139028390183E+16 - 150.128392537138) / (1 + Math.pow(nodesCount / 2.12316143430556E+31, -0.461309470817812)) + 150.128392537138;
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
}
exports.D3ForceGraph = D3ForceGraph;

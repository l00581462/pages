"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class PngLoader {
    constructor() {
        this.result = {};
        this.init();
    }
    init() {
        const requireComponent = require.context('../assets/png', false, /\.png/);
        requireComponent.keys().forEach((filePath) => {
            const componentConfig = requireComponent(filePath);
            const fileName = this.validateFileName(filePath);
            this.result[fileName] = componentConfig;
        });
    }
    validateFileName(str) {
        return /^\S+\.png/.test(str) && str.replace(/^\S+\/(\w+)\.png/, (rs, $1) => $1.toUpperCase());
    }
    getIconByName(name) {
        return this.result[name.toUpperCase()];
    }
}
exports.PngLoader = PngLoader;

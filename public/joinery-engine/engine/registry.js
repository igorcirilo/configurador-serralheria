import { drawAwning } from '../symbols/awning.js';
import { drawCasementLeft, drawCasementRight, drawDoubleCasement } from '../symbols/casement.js';
import { drawFixed } from '../symbols/fixed.js';
import { drawHopper } from '../symbols/hopper.js';
import { drawPivotVertical } from '../symbols/pivot.js';
import { drawSliding2, drawSliding3 } from '../symbols/sliding.js';
import { drawTiltTurnLeft, drawTiltTurnRight } from '../symbols/tiltturn.js';
export class RendererRegistry {
    renderers = new Map();
    register(type, renderer) {
        this.renderers.set(type, renderer);
    }
    get(type) {
        const renderer = this.renderers.get(type);
        if (!renderer)
            throw new Error(`Renderer not registered for ${type}`);
        return renderer;
    }
}
let singletonRegistry = null;
export function getRegistry() {
    if (singletonRegistry)
        return singletonRegistry;
    singletonRegistry = new RendererRegistry();
    singletonRegistry.register('fixed', drawFixed);
    singletonRegistry.register('casement_left', drawCasementLeft);
    singletonRegistry.register('casement_right', drawCasementRight);
    singletonRegistry.register('double_casement', drawDoubleCasement);
    singletonRegistry.register('sliding_2', drawSliding2);
    singletonRegistry.register('sliding_3', drawSliding3);
    singletonRegistry.register('tilt_turn_left', drawTiltTurnLeft);
    singletonRegistry.register('tilt_turn_right', drawTiltTurnRight);
    singletonRegistry.register('awning', drawAwning);
    singletonRegistry.register('hopper', drawHopper);
    singletonRegistry.register('pivot_vertical', drawPivotVertical);
    return singletonRegistry;
}

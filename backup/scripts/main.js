import { SceneAspectsApp } from "./apps/scene-aspects.js";
import { RollModifiers } from "./features/roll-modifiers.js";

const MODULE_ID = "fatex-extras";
const SOCKET_NAME = `module.${MODULE_ID}`;

Hooks.once("diceSoNiceReady", (dice3d) => {
    dice3d.addSystem({ id: "fatex-extras", name: "FateX Extras" }, "default");
    dice3d.addDicePreset({
        type: "dc",
        labels: ["", ""], 
        modelFile: "modules/fatex-extras/assets/dc_die.glb",
        system: "fatex-extras"
    });
});

Hooks.once("ready", () => {
    RollModifiers.init();

    game.socket.on(SOCKET_NAME, async (payload) => {
        if (payload.action === "REFRESH_APPS") {
            refreshApps();
        }
        else if (game.user.isGM) {
            if (payload.action === "UPDATE_SCENE_ASPECTS" || payload.type === "updateSceneAspects") {
                // GM processes scene updates
                const sceneId = payload.sceneId || canvas.scene?.id;
                const targetScene = game.scenes.get(sceneId);
                
                if (targetScene) {
                    const update = {};
                    if (payload.aspects) update["flags.fatex-extras.sceneAspects"] = payload.aspects;
                    if (payload.groups) update["flags.fatex-extras.sceneAspectGroups"] = payload.groups;
                    if (payload.tags) update["flags.fatex-extras.sceneAspectTags"] = payload.tags;
                    
                    try {
                        await targetScene.update(update);
                    } catch (err) {
                        console.error("FateX Extras | GM failed to update scene aspects:", err);
                    }
                    
                    // Broadcast refresh
                    game.socket.emit(SOCKET_NAME, { action: "REFRESH_APPS" });
                    refreshApps();
                }
            } else if (payload.action === "UPDATE_CHAT_MESSAGE") {
                const msg = game.messages.get(payload.messageId);
                if (msg) {
                    try {
                        await msg.update(payload.updateData);
                    } catch (err) {
                        console.error("FateX Extras | GM failed to update message:", err);
                    }
                }
            } else if (payload.action === "UPDATE_ACTOR") {
                const actor = game.actors.get(payload.actorId);
                if (actor) {
                    try {
                        await actor.update(payload.updateData);
                    } catch (err) {
                        console.error("FateX Extras | GM failed to update actor:", err);
                    }
                }
            }
        }
    });
});

Hooks.on("updateScene", (scene, data, options, userId) => {
    if (scene.id === canvas.scene?.id && foundry.utils.getProperty(data, "flags.fatex-extras")) {
        refreshApps();
    }
});

Hooks.on("getSceneControlButtons", (controls) => {
    let tokenControls;
    if (Array.isArray(controls)) {
        tokenControls = controls.find(c => c.name === "token") || controls.find(c => c.name === "tokens");
    } else if (controls && Array.isArray(controls.controls)) {
        tokenControls = controls.controls.find(c => c.name === "token" || c.name === "tokens");
    } else if (controls && typeof controls === "object") {
        if (controls.token) tokenControls = controls.token;
        else if (controls.tokens) tokenControls = controls.tokens;
        else tokenControls = Object.values(controls).find(c => c && (c.name === "token" || c.name === "tokens"));
    }
    
    if (tokenControls) {
        if (!tokenControls.tools) tokenControls.tools = [];
        const tool = {
            name: "scene-aspects",
            title: "Aspect Manager",
            icon: "fas fa-book-open",
            visible: true, 
            onClick: () => { new SceneAspectsApp().render(true); },
            button: true
        };
        if (Array.isArray(tokenControls.tools)) {
            if (!tokenControls.tools.find(t => t.name === "scene-aspects")) tokenControls.tools.push(tool);
        } else {
            tokenControls.tools["scene-aspects"] = tool;
        }
    }
});

function refreshApps() {
    Object.values(ui.windows).forEach(w => { 
        if (w instanceof SceneAspectsApp) w.render(); 
    });
}

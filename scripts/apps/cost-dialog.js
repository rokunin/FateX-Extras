import { AspectStorage } from "../helpers/aspect-storage.js";

export class CostDialog extends Dialog {
    static async create(actor, callback) {
        const storage = await AspectStorage.getStorage();
        const sceneAspects = storage ? (storage.getFlag("fatex-extras", AspectStorage.FLAGS.ASPECTS) || []) : [];
        const isGM = game.user.isGM;
        
        const availableOptions = [];

        const allCharacterInvokes = storage ? (storage.getFlag("fatex-extras", AspectStorage.FLAGS.CHARACTER_INVOKES) || {}) : {};

        for (const [itemId, data] of Object.entries(allCharacterInvokes)) {
            if (data.value > 0) {
                
                let actorName = data.actorName || "Unknown";
                let hasPermission = true; 
                
                if (data.actorId) {
                    const realActor = game.actors.get(data.actorId);
                    if (realActor) {
                        actorName = realActor.name;
                    }
                }

                if (hasPermission) {
                    const typeLabel = data.type === "consequence" ? game.i18n.localize("FAx.CostDialog.Consequence") : game.i18n.localize("FAx.CostDialog.Aspect");
                    
                    let aspectText = data.text || data.name;
                    if (typeof aspectText === 'string') {
                        const tempDiv = document.createElement("div");
                        tempDiv.innerHTML = aspectText;
                        aspectText = tempDiv.textContent || tempDiv.innerText || aspectText;
                    }

                    availableOptions.push({
                        name: `${actorName} - ${typeLabel} - ${aspectText} (${data.value})`,
                        id: itemId,
                        actorId: data.actorId,
                        type: "character_aspect",
                        originalItem: null 
                    });
                }
            }
        }

        sceneAspects.forEach((aspect, index) => {
            if (aspect.hidden) return; 

            if ((aspect.invokes || 0) > 0) {
                availableOptions.push({
                    name: `${aspect.name} (${aspect.invokes})`,
                    aspectIndex: index,
                    type: "standard",
                    originalAspect: aspect
                });
            }

            if (isGM && (aspect.hostileInvokes || 0) > 0) {
                availableOptions.push({
                    name: `${aspect.name} [${game.i18n.localize("FAx.Global.HostileInvokes")}] (${aspect.hostileInvokes})`,
                    aspectIndex: index,
                    type: "hostile",
                    originalAspect: aspect
                });
            }
        });

        const content = await renderTemplate("modules/fatex-extras/templates/cost-dialog.hbs", {
            actor: actor,
            fatePoints: actor ? actor.system.fatepoints.current : 0,
            hasFatePoints: actor ? actor.system.fatepoints.current > 0 : false,
            aspects: availableOptions,
            hasAspects: availableOptions.length > 0
        });

        return new Promise(resolve => {
            new CostDialog({
                title: game.i18n.localize("FAx.CostDialog.Title"),
                content: content,
                buttons: {
                    pay: {
                        label: game.i18n.localize("FAx.CostDialog.PayAndProceed"),
                        icon: '<i class="fas fa-check"></i>',
                        callback: async (html) => {
                            const choice = html.find('input[name="cost-type"]:checked').val();
                            
                            if (choice === "fatepoint") {
                                if (actor) {
                                    await CostDialog._updateActor(actor, { "system.fatepoints.current": actor.system.fatepoints.current - 1 });
                                    
                                    if (game.dice3d) {
                                        await game.dice3d.show({
                                            throws: [{
                                                dice: [{
                                                    result: 1,
                                                    resultLabel: 1,
                                                    type: "dc",
                                                    vectors: [],
                                                    options: {}
                                                }]
                                            }]
                                        }, game.user, true);
                                    }
                                }
                            } else if (choice === "aspect") {
                                const selectedOptionIndex = html.find('input[name="aspect-select"]').val();
                                const selectedOption = availableOptions[selectedOptionIndex];
                                
                                if (selectedOption) {
                                    if (selectedOption.type === "character_aspect") {
                                        const globalInvokes = await AspectStorage.getGlobalInvokeCount(selectedOption.id); 
                                        const newValue = Math.max(0, globalInvokes - 1);
                                        
                                        await AspectStorage.updateGlobalInvokeCount(selectedOption.id, newValue);
                                        
                                    } else {
                                        const storage = await AspectStorage.getStorage();
                                        if (storage) {
                                            const currentAspects = foundry.utils.duplicate(storage.getFlag("fatex-extras", AspectStorage.FLAGS.ASPECTS) || []);
                                            const targetIndex = selectedOption.aspectIndex;
                                            
                                            if (currentAspects[targetIndex]) {
                                                if (selectedOption.type === "hostile") {
                                                    currentAspects[targetIndex].hostileInvokes = Math.max(0, (currentAspects[targetIndex].hostileInvokes || 0) - 1);
                                                } else {
                                                    currentAspects[targetIndex].invokes = Math.max(0, (currentAspects[targetIndex].invokes || 0) - 1);
                                                }
                                                
                                                if (game.user.isGM || storage.isOwner) {
                                                    await storage.update({ [`flags.fatex-extras.${AspectStorage.FLAGS.ASPECTS}`]: currentAspects });
                                                } else {
                                                    game.socket.emit("module.fatex-extras", {
                                                        action: "UPDATE_JOURNAL",
                                                        journalId: storage.id,
                                                        updateData: { [`flags.fatex-extras.${AspectStorage.FLAGS.ASPECTS}`]: currentAspects }
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            
                            resolve(true);
                        }
                    },
                    cancel: {
                        label: game.i18n.localize("FAx.CostDialog.Cancel"),
                        icon: '<i class="fas fa-times"></i>',
                        callback: () => resolve(false)
                    }
                },
                default: "pay",
                render: (html) => {
                    const radioInputs = html.find('input[name="cost-type"]');
                    const aspectSelectInput = html.find('input[name="aspect-select"]');
                    const aspectSelectDiv = html.find('.fatex-select-custom');
                    const options = html.find('.fatex-select-option');

                    options.on("click", (e) => {
                        options.removeClass("selected");
                        $(e.currentTarget).addClass("selected");
                        aspectSelectInput.val($(e.currentTarget).attr("data-value"));
                    });
                    
                    radioInputs.on("change", (e) => {
                        if (e.target.value === "aspect") {
                            aspectSelectDiv.removeClass("disabled");
                        } else {
                            aspectSelectDiv.addClass("disabled");
                        }
                        const app = html.closest('.app.window-app');
                        app.css('height', 'auto');
                    });
                    
                    if (html.find('input[name="cost-type"]:checked').val() !== "aspect") {
                        aspectSelectDiv.addClass("disabled");
                    } else {
                        aspectSelectDiv.removeClass("disabled");
                    }
                    
                    html.closest('.app.window-app').css('height', 'auto');
                }
            }).render(true);
        });
    }

    static async _updateActor(actor, updateData) {
        if (game.user.isGM || actor.isOwner) {
            await actor.update(updateData);
        } else {
            game.socket.emit("module.fatex-extras", {
                action: "UPDATE_ACTOR",
                actorId: actor.id,
                updateData: updateData
            });
        }
    }
}

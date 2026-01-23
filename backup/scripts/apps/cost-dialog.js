export class CostDialog extends Dialog {
    static async create(actor, callback) {
        const sceneAspects = canvas.scene ? (canvas.scene.getFlag("fatex-extras", "sceneAspects") || []) : [];
        const availableAspects = sceneAspects
            .map((a, index) => ({ ...a, originalIndex: index }))
            .filter(a => (a.invokes || 0) > 0);

        const content = await renderTemplate("modules/fatex-extras/templates/cost-dialog.hbs", {
            actor: actor,
            fatePoints: actor ? actor.system.fatepoints.current : 0,
            hasFatePoints: actor ? actor.system.fatepoints.current > 0 : false,
            aspects: availableAspects,
            hasAspects: availableAspects.length > 0
        });

        return new Promise(resolve => {
            new CostDialog({
                title: "Pay Cost",
                content: content,
                buttons: {
                    pay: {
                        label: "Pay & Proceed",
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
                                const selectedAspectIndex = html.find('select[name="aspect-select"]').val();
                                const selectedAspect = availableAspects[selectedAspectIndex];
                                
                                if (selectedAspect) {
                                    const currentAspects = foundry.utils.duplicate(canvas.scene.getFlag("fatex-extras", "sceneAspects") || []);
                                    const targetIndex = selectedAspect.originalIndex;
                                    
                                    if (currentAspects[targetIndex]) {
                                        currentAspects[targetIndex].invokes = Math.max(0, (currentAspects[targetIndex].invokes || 0) - 1);
                                        await CostDialog._updateSceneAspects(currentAspects);
                                    }
                                }
                            }
                            
                            resolve(true);
                        }
                    },
                    cancel: {
                        label: "Cancel",
                        icon: '<i class="fas fa-times"></i>',
                        callback: () => resolve(false)
                    }
                },
                default: "pay",
                render: (html) => {
                    const radioInputs = html.find('input[name="cost-type"]');
                    const aspectSelect = html.find('select[name="aspect-select"]');
                    
                    radioInputs.on("change", (e) => {
                        if (e.target.value === "aspect") {
                            aspectSelect.prop("disabled", false);
                        } else {
                            aspectSelect.prop("disabled", true);
                        }
                    });
                    
                    if (html.find('input[name="cost-type"]:checked').val() !== "aspect") {
                        aspectSelect.prop("disabled", true);
                    }
                }
            }).render(true);
        });
    }

    static async _updateActor(actor, updateData) {
        if (game.user.isGM) {
            await actor.update(updateData);
        } else {
            // Attempt socket delegation for ALL players
            game.socket.emit("module.fatex-extras", {
                action: "UPDATE_ACTOR",
                actorId: actor.id,
                updateData: updateData
            });
            
            // Optimistic check: if permissions allow, try direct to catch errors or fast success?
            // Actually, actors are usually player-owned, so direct update is better default.
            // But if they failed before, socket is safer.
            // Let's rely on socket for robustness.
        }
    }

    static async _updateSceneAspects(aspects) {
        if (game.user.isGM) {
            await canvas.scene.setFlag("fatex-extras", "sceneAspects", aspects);
        } else {
            // Delegate to GM via socket
            game.socket.emit("module.fatex-extras", {
                action: "UPDATE_SCENE_ASPECTS",
                sceneId: canvas.scene.id,
                aspects: aspects
            });
        }
    }
}

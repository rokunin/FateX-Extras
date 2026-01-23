import { CostDialog } from "../apps/cost-dialog.js";

export class RollModifiers {
    static init() {
        Hooks.on("renderChatMessageHTML", (message, html, data) => RollModifiers.onRenderChatMessage(message, html, data));
        
        Hooks.on("updateChatMessage", (message, changes, options, userId) => {
            if (!game.user.isGM) return;

            const newHistory = foundry.utils.getProperty(changes, "flags.fatex.chatCard.rolls.0.history");
            if (newHistory) {
                const rollData = message.flags?.fatex?.chatCard?.rolls?.[0];
                const mainHistory = rollData?.history || [];
                let extrasHistory = message.getFlag("fatex-extras", "history") || [];
                
                if (mainHistory.length > extrasHistory.length) {
                    const newExtras = [...extrasHistory];
                    while (newExtras.length < mainHistory.length) {
                        newExtras.push(null);
                    }
                    message.setFlag("fatex-extras", "history", newExtras);
                }
            }
        });
    }

    static onRenderChatMessage(message, html, data) {
        const rollElement = html.querySelector(".fatex-roll");
        if (!rollElement) return;

        const actions = rollElement.querySelector(".fatex-roll-actions");
        if (!actions) return;

        if (game.user.isGM) {
            if (!actions.querySelector('.fatex-extras-btn[data-action="increase-one"]')) {
                const increaseOneBtn = document.createElement("button");
                increaseOneBtn.dataset.action = "increase-one";
                increaseOneBtn.classList.add("fatex-extras-btn");
                increaseOneBtn.textContent = "+1";
                increaseOneBtn.type = "button";

                const decreaseOneBtn = document.createElement("button");
                decreaseOneBtn.dataset.action = "decrease-one";
                decreaseOneBtn.classList.add("fatex-extras-btn");
                decreaseOneBtn.textContent = "-1";
                decreaseOneBtn.type = "button";

                const increaseTwoBtn = actions.querySelector('button[data-action="increase"]');
                if (increaseTwoBtn) {
                    actions.insertBefore(decreaseOneBtn, increaseTwoBtn);
                    actions.insertBefore(increaseOneBtn, increaseTwoBtn);
                } else {
                     actions.appendChild(decreaseOneBtn);
                     actions.appendChild(increaseOneBtn);
                }

                increaseOneBtn.addEventListener("click", (e) => RollModifiers.handleModifier(e, message, 1));
                decreaseOneBtn.addEventListener("click", (e) => RollModifiers.handleModifier(e, message, -1));
            }
        }

        const interceptor = (event) => RollModifiers.handleCostAndProceed(event, message);

        const increaseTwoBtn = actions.querySelector('button[data-action="increase"]');
        if (increaseTwoBtn && !increaseTwoBtn.dataset.intercepted) {
            increaseTwoBtn.dataset.intercepted = "true";
            increaseTwoBtn.addEventListener("click", interceptor, { capture: true });
        }

        const rerollBtn = actions.querySelector('button[data-action="reroll"]');
        if (rerollBtn && !rerollBtn.dataset.intercepted) {
            rerollBtn.dataset.intercepted = "true";
            rerollBtn.addEventListener("click", interceptor, { capture: true });
        }

        try {
            const customHistory = message.getFlag("fatex-extras", "history");
            if (Array.isArray(customHistory) && customHistory.length > 0) {
                const historyEntries = html.querySelectorAll(".fatex-roll__history__entry");
                const rollData = message.flags?.fatex?.chatCard?.rolls?.[0];
                const mainHistory = rollData?.history;

                if (mainHistory && Array.isArray(mainHistory)) {
                    customHistory.forEach((customEntry, index) => {
                        if (customEntry && customEntry.message && historyEntries[index]) {
                            const originalUser = mainHistory[index]?.user || "Unknown";
                            historyEntries[index].textContent = `${originalUser} ${customEntry.message}`;
                        }
                    });
                }
            }
        } catch (err) {
            console.error("FateX Extras | Visual Repair Failed:", err);
        }
    }

    static async handleCostAndProceed(event, message) {
        if (event.target.dataset.bypass === "true") return;

        event.stopImmediatePropagation();
        event.preventDefault();

        let actor = game.user.character;

        if (!actor) {
            if (message.speaker.token) {
                const token = canvas.tokens.get(message.speaker.token);
                if (token) actor = token.actor;
            }
            if (!actor && message.speaker.actor) {
                actor = game.actors.get(message.speaker.actor);
            }
        }

        const proceed = await CostDialog.create(actor);
        if (!proceed) return;

        event.target.dataset.bypass = "true";
        event.target.click();
        delete event.target.dataset.bypass;
        
        if (!game.user.isGM && !message.isOwner) {
             const actionType = event.target.dataset.action; 
             if (actionType === "increase") {
                 await RollModifiers.handleModifier(event, message, 2);
             } else if (actionType === "reroll") {
                 await RollModifiers.handleReroll(event, message);
             }
        }
    }

    static async handleModifier(event, message, amount) {
        
        const msg = game.messages.get(message.id) || message;
        const flags = msg.flags;
        if (flags.fatex && flags.fatex.chatCard) {
            const chatCard = foundry.utils.duplicate(flags.fatex.chatCard);
            if (chatCard.rolls && chatCard.rolls.length > 0) {
                const rollData = chatCard.rolls[0];
                
                rollData.bonus = (rollData.bonus || 0) + amount;
                
                let currentTotal = rollData.total;
                if (Array.isArray(rollData.faces) && typeof rollData.rank === 'number') {
                     const diceTotal = rollData.faces.reduce((a, b) => a + b, 0);
                     currentTotal = diceTotal + rollData.rank + rollData.bonus;
                } else if (typeof currentTotal === 'number') {
                    currentTotal += amount;
                }
                rollData.total = currentTotal;

                const sign = currentTotal >= 0 ? "+" : "";
                rollData.totalString = `${sign}${currentTotal}`;
                const newLadder = RollModifiers.getLadderLabel(currentTotal);
                rollData.ladder = newLadder;

                if (currentTotal > 0) rollData.rankStatus = "positive";
                else if (currentTotal < 0) rollData.rankStatus = "negative";
                else rollData.rankStatus = "neutral";
                
                if (!rollData.history) rollData.history = [];
                const modSign = amount > 0 ? "+" : "";
                const historyMessage = game.i18n.format("FAx.RollHistory.Added", { amount: `${modSign}${amount}` });
                
                rollData.history.push({
                    user: game.user.name,
                    message: historyMessage, 
                    type: "increase", 
                    timestamp: Date.now()
                });

                let extrasHistory = msg.getFlag("fatex-extras", "history") || [];
                while (extrasHistory.length < rollData.history.length - 1) {
                    extrasHistory.push(null); 
                }
                extrasHistory.push({ message: historyMessage });

                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = msg.content;
                const totalEl = tempDiv.querySelector(".fatex-roll__total");
                if (totalEl) totalEl.textContent = rollData.totalString;
                const ladderEl = tempDiv.querySelector(".fatex-roll__ladder");
                if (ladderEl) ladderEl.textContent = newLadder;
                const headerIcon = tempDiv.querySelector(".fatex-headline__icon");
                if (headerIcon) {
                    if (rollData.rankStatus === "negative") headerIcon.classList.add("fatex-headline__icon--negative");
                    else headerIcon.classList.remove("fatex-headline__icon--negative");
                }
                let historyContainer = tempDiv.querySelector(".fatex-roll__history");
                if (!historyContainer) {
                    historyContainer = document.createElement("div");
                    historyContainer.className = "fatex-roll__history";
                    tempDiv.querySelector(".fatex-result")?.appendChild(historyContainer);
                }
                const newEntry = document.createElement("div");
                newEntry.className = "fatex-roll__history__entry";
                newEntry.textContent = `${game.user.name} ${historyMessage}`;
                historyContainer.appendChild(newEntry);

                await RollModifiers._updateMessage(msg, {
                    "content": tempDiv.innerHTML,
                    "flags.fatex.chatCard": chatCard,
                    "flags.fatex-extras.history": extrasHistory
                });
            }
        }
    }

    static async handleReroll(event, message) {
        const msg = game.messages.get(message.id) || message;
        const flags = msg.flags;
        if (flags.fatex && flags.fatex.chatCard) {
            const chatCard = foundry.utils.duplicate(flags.fatex.chatCard);
            if (chatCard.rolls && chatCard.rolls.length > 0) {
                const rollData = chatCard.rolls[0];

                const r = new Roll("4dF");
                await r.evaluate();
                if (game.dice3d) await game.dice3d.showForRoll(r, game.user, true);
                
                rollData.faces = r.terms[0].results.map(res => res.result);
                rollData.dice = rollData.faces;

                const diceTotal = rollData.faces.reduce((a, b) => a + b, 0);
                rollData.total = diceTotal + (rollData.rank || 0) + (rollData.bonus || 0);

                const sign = rollData.total >= 0 ? "+" : "";
                rollData.totalString = `${sign}${rollData.total}`;
                const newLadder = RollModifiers.getLadderLabel(rollData.total);
                rollData.ladder = newLadder;

                if (rollData.total > 0) rollData.rankStatus = "positive";
                else if (rollData.total < 0) rollData.rankStatus = "negative";
                else rollData.rankStatus = "neutral";

                if (!rollData.history) rollData.history = [];
                const previousTotal = msg.flags.fatex.chatCard.rolls[0].total;
                const historyMessage = game.i18n.format("FAx.RollHistory.Rerolled", { previous: previousTotal });
                
                rollData.history.push({
                    user: game.user.name,
                    message: historyMessage,
                    type: "reroll",
                    timestamp: Date.now(),
                    previousRollTotal: previousTotal
                });

                let extrasHistory = msg.getFlag("fatex-extras", "history") || [];
                while (extrasHistory.length < rollData.history.length - 1) {
                    extrasHistory.push(null); 
                }
                extrasHistory.push({ message: historyMessage });

                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = msg.content;
                const totalEl = tempDiv.querySelector(".fatex-roll__total");
                if (totalEl) totalEl.textContent = rollData.totalString;
                const ladderEl = tempDiv.querySelector(".fatex-roll__ladder");
                if (ladderEl) ladderEl.textContent = newLadder;
                const headerIcon = tempDiv.querySelector(".fatex-headline__icon");
                if (headerIcon) {
                    if (rollData.rankStatus === "negative") headerIcon.classList.add("fatex-headline__icon--negative");
                    else headerIcon.classList.remove("fatex-headline__icon--negative");
                }
                const diceContainer = tempDiv.querySelector(".fatex-dice");
                if (diceContainer) {
                    diceContainer.innerHTML = "";
                    const symbols = rollData.faces.map(val => {
                        if (val === 1) return "+";
                        if (val === -1) return "-";
                        return "0";
                    });
                    symbols.forEach(sym => {
                        const dieDiv = document.createElement("div");
                        dieDiv.textContent = sym;
                        diceContainer.appendChild(dieDiv);
                    });
                }
                let historyContainer = tempDiv.querySelector(".fatex-roll__history");
                if (!historyContainer) {
                    historyContainer = document.createElement("div");
                    historyContainer.className = "fatex-roll__history";
                    tempDiv.querySelector(".fatex-result")?.appendChild(historyContainer);
                }
                const newEntry = document.createElement("div");
                newEntry.className = "fatex-roll__history__entry";
                newEntry.textContent = `${game.user.name} ${historyMessage}`;
                historyContainer.appendChild(newEntry);

                await RollModifiers._updateMessage(msg, {
                    "content": tempDiv.innerHTML,
                    "flags.fatex.chatCard": chatCard,
                    "flags.fatex-extras.history": extrasHistory
                });
            }
        }
    }

    static async _updateMessage(message, updateData) {
        if (game.user.isGM) {
            await message.update(updateData);
        } else {
            game.socket.emit("module.fatex-extras", {
                action: "UPDATE_CHAT_MESSAGE",
                messageId: message.id,
                updateData: updateData
            });
        }
    }

    static getLadderLabel(total) {
        const clampedTotal = Math.max(-5, Math.min(8, total));
        const sign = clampedTotal >= 0 ? "+" : "";
        const key = `FAx.Global.Ladder.${sign}${clampedTotal}`;
        
        const localized = game.i18n.localize(key);
        return localized !== key ? localized : "";
    }
}

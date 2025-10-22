/*:
 * @target MZ
 * @plugindesc v1.4 Adds a "Chat" menu, an NPC picker, and an optional quick chat bar on the map.
 * @author You
 * 
 * @param EnableQuickBar
 * @text Enable Quick Chat Bar
 * @type boolean
 * @desc Show a small chat bar on the bottom of the map for quick player messages.
 * @default true
 * 
 * @param QuickBarLabel
 * @text Quick Bar Label
 * @type string
 * @default Chat…
 * 
 * @param ChatTargetIncludeTag
 * @text Include Tag
 * @type string
 * @desc Note tag to explicitly include an event as a chat target (e.g., <ChatTarget>)
 * @default ChatTarget
 * 
 * @param ChatTargetExcludeTag
 * @text Exclude Tag
 * @type string
 * @desc Note tag to explicitly exclude an event from chat targets (e.g., <NoChat>)
 * @default NoChat
 * 
 * @param UntaggedChatTargetsIncluded
 * @text Untagged Included By Default
 * @type boolean
 * @desc true: events without include/exclude tags are included. false: only tagged are included.
 * @default true
 * 
 * @param RestrictChatToNearbyNPCs
 * @text Restrict Chat To Nearby NPCs
 * @type boolean
 * @desc true: only adjacent NPCs are chat targets. false: any NPC on the current map.
 * @default true
 * 
 * @command RestrictChatToNearbyNPCs
 * @text Set Chat Scope: Nearby Only
 * @desc Toggle whether the Chat menu is restricted to adjacent NPCs.
 * @arg value
 * @text Nearby Only
 * @type boolean
 * @default true
 * 
 * @help ChatMenu.js
 * Adds a new "Chat" command to the main menu and a simple Chat scene to pick
 * an adjacent NPC (or any NPC, configurable) and send a message. Optionally shows a compact quick chat bar
 * on the map so the player can quickly type a message.
 * 
 * Usage:
 * - Enable the plugin.
 * - Configure the Quick Chat Bar via plugin parameters.
 * - During NPC dialog (from AICharacter), a quick "Antworten…" choice may be offered.
 * 
 * Terms of Use: MIT
 */

(() => {
    "use strict";

    const pluginName = "ChatMenu";
    const params = PluginManager.parameters(pluginName);
    const enableQuickBar = String(params["EnableQuickBar"] || "true").toLowerCase() === "true";
    const quickBarLabel = String(params["QuickBarLabel"] || "Chat…");
    const includeTagName = String(params["ChatTargetIncludeTag"] || "ChatTarget").trim();
    const excludeTagName = String(params["ChatTargetExcludeTag"] || "NoChat").trim();
    const untaggedIncluded = String(params["UntaggedChatTargetsIncluded"] || "true").toLowerCase() === "true";
    const restrictNearbyDefault = String(params["RestrictChatToNearbyNPCs"] || "true").toLowerCase() === "true";
    // --- Notetag helpers ---
    function ChatMenu_eventMeta(ev) {
        try {
            const data = ev && ev.event && ev.event();
            if (!data) return { note: "", meta: {} };
            const note = String(data.note || "");
            const meta = data.meta || {};
            return { note, meta };
        } catch (_) { return { note: "", meta: {} }; }
    }

    function ChatMenu_metaHasKey(meta, keyLower) {
        try {
            for (const k in meta) {
                if (Object.prototype.hasOwnProperty.call(meta, k)) {
                    if (String(k).toLowerCase() === keyLower) return true;
                }
            }
        } catch (_) { }
        return false;
    }

    function ChatMenu_noteHasTag(note, tagLower) {
        try {
            if (!note) return false;
            const re = new RegExp("<" + tagLower.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "(\\:[^>]*)?>", "i");
            return re.test(note);
        } catch (_) { return false; }
    }

    function ChatMenu_isEventChatTarget(ev) {
        const { note, meta } = ChatMenu_eventMeta(ev);
        const inc = String(includeTagName || "").trim().toLowerCase();
        const exc = String(excludeTagName || "").trim().toLowerCase();
        if (exc && (ChatMenu_metaHasKey(meta, exc) || ChatMenu_noteHasTag(note, exc))) return false;
        if (inc && (ChatMenu_metaHasKey(meta, inc) || ChatMenu_noteHasTag(note, inc))) return true;
        return !!untaggedIncluded;
    }


    // Runtime flag stored in save data
    function ChatMenu_isNearbyOnly() {
        try {
            if ($gameSystem && typeof $gameSystem._chatNearbyOnly === "boolean") return $gameSystem._chatNearbyOnly;
        } catch (_) { }
        return restrictNearbyDefault;
    }

    PluginManager.registerCommand(pluginName, "RestrictChatToNearbyNPCs", function (args) {
        const v = String(args && args.value != null ? args.value : "").trim().toLowerCase();
        const flag = (v === "true" || v === "on" || v === "1");
        if ($gameSystem) $gameSystem._chatNearbyOnly = flag;
    });

    // 1) Inject "Chat" into the main menu command list
    const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function () {
        _Window_MenuCommand_addOriginalCommands.call(this);
        const enabled = this.areMainCommandsEnabled ? this.areMainCommandsEnabled() : true;
        this.addCommand("Chat", "chat", enabled);
    };

    // 2) Handle the new command in Scene_Menu
    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function () {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler("chat", this.commandChat.bind(this));
    };

    Scene_Menu.prototype.commandChat = function () {
        SceneManager.push(Scene_Chat);
    };

    // 3) Chat scene: list adjacent NPCs, prompt for message, append to AI history
    function Scene_Chat() {
        this.initialize(...arguments);
    }

    Scene_Chat.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_Chat.prototype.constructor = Scene_Chat;

    Scene_Chat.prototype.initialize = function () {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_Chat.prototype.create = function () {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        this._helpWindow.setText(ChatMenu_isNearbyOnly() ? "Chat\nChoose an adjacent NPC to chat with." : "Chat\nChoose an NPC to chat with.");
        this._npcs = this.findSelectableNpcs();
        this.createNpcListWindow();
    };

    Scene_Chat.prototype.helpAreaHeight = function () {
        return this.calcWindowHeight(2, true);
    };

    Scene_Chat.prototype.createNpcListWindow = function () {
        const rect = this.npcListWindowRect();
        this._npcWindow = new Window_ChatNpcList(rect, this._npcs);
        this._npcWindow.setHandler("ok", this.onNpcOk.bind(this));
        this._npcWindow.setHandler("cancel", this.popScene.bind(this));
        this.addWindow(this._npcWindow);
        this._npcWindow.activate();
        this._npcWindow.select(0);
    };

    Scene_Chat.prototype.npcListWindowRect = function () {
        const ww = 480;
        const wh = this.calcWindowHeight(6, true);
        const wx = Math.floor((Graphics.boxWidth - ww) / 2);
        const wy = Math.floor((Graphics.boxHeight - wh) / 2);
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Chat.prototype.findSelectableNpcs = function () {
        const source = ChatMenu_isNearbyOnly() ? ChatMenu_findAdjacentNpcs() : ChatMenu_findAllNpcs();
        return source.filter(n => {
            const ev = $gameMap.event(n.id);
            return ev && ChatMenu_isEventChatTarget(ev);
        });
    };

    Scene_Chat.prototype.onNpcOk = function () {
        const npc = this._npcWindow.currentNpc();
        if (!npc) {
            this.popScene();
            return;
        }
        // Use default text input dialog provided by Window_NameEdit/Window_NameInput pattern
        this.openTextInputForNpc(npc);
    };

    // 4) Quick Chat Bar on Scene_Map (optional)
    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function () {
        _Scene_Map_createAllWindows.call(this);
        if (enableQuickBar) {
            this.createChatQuickBar();
        }
    };

    Scene_Map.prototype.createChatQuickBar = function () {
        const rect = this.chatQuickBarRect();
        this._chatQuickBar = new Window_ChatQuickBar(rect, quickBarLabel);
        this._chatQuickBar.setHandler("ok", this.onQuickBarOk.bind(this));
        this._chatQuickBar.setHandler("cancel", () => { });
        this.addWindow(this._chatQuickBar);
        this._chatQuickBar.deactivate();
    };

    Scene_Map.prototype.chatQuickBarRect = function () {
        const ww = Math.max(240, Math.floor(Graphics.boxWidth * 0.3));
        const wh = this.calcWindowHeight(2, true);
        const wx = Math.floor((Graphics.boxWidth - ww) / 2);
        const wy = Graphics.boxHeight - wh - 12;
        return new Rectangle(wx, wy, ww, wh);
    };

    Scene_Map.prototype.onQuickBarOk = function () {
        // If exactly one selectable NPC, prompt directly; else push NPC picker.
        const list = ChatMenu_findSelectableNpcs();
        if (list.length === 1) {
            ChatMenu_promptToNpc(list[0]);
        } else if (list.length > 1) {
            SceneManager.push(Scene_Chat);
        } else {
            $gameMessage.add(ChatMenu_isNearbyOnly() ? "No adjacent NPCs" : "No NPCs on this map");
        }
        if (this._chatQuickBar) this._chatQuickBar.deactivate();
    };

    function ChatMenu_findAdjacentNpcs() {
        const player = $gamePlayer;
        const px = player.x;
        const py = player.y;
        const events = $gameMap.events();
        const adj = events.filter(e => {
            const dx = Math.abs(e.x - px);
            const dy = Math.abs(e.y - py);
            return dx + dy === 1;
        }).map(e => ({ id: e.eventId(), name: e.event().name || ("Event " + e.eventId()), x: e.x, y: e.y }));
        return adj;
    }

    function ChatMenu_findAllNpcs() {
        return $gameMap.events().map(e => ({ id: e.eventId(), name: e.event().name || ("Event " + e.eventId()), x: e.x, y: e.y }));
    }

    function ChatMenu_findSelectableNpcs() {
        const source = ChatMenu_isNearbyOnly() ? ChatMenu_findAdjacentNpcs() : ChatMenu_findAllNpcs();
        return source.filter(n => {
            const ev = $gameMap.event(n.id);
            return ev && ChatMenu_isEventChatTarget(ev);
        });
    }

    function ChatMenu_promptToNpc(npc) {
        try {
            if (typeof window !== "undefined" && window.AICharacter && typeof window.AICharacter.promptPlayerMessageToNpc === "function") {
                window.AICharacter.promptPlayerMessageToNpc(npc);
                return;
            }
        } catch (_) { }
        try {
            if (typeof window !== "undefined" && window.prompt) {
                const t = window.prompt("Message to " + (npc.name || ("Event " + npc.id)) + ":", "");
                if (t && t.trim().length > 0) {
                    if (window.AICharacter && typeof window.AICharacter.addToGlobalHistory === "function") {
                        window.AICharacter.addToGlobalHistory("Player says to " + (npc.name || ("Event " + npc.id)) + ": \"" + t.trim() + "\"");
                    }
                }
            }
        } catch (_) { }
    }

    function Window_ChatQuickBar() { this.initialize(...arguments); }
    Window_ChatQuickBar.prototype = Object.create(Window_Selectable.prototype);
    Window_ChatQuickBar.prototype.constructor = Window_ChatQuickBar;
    Window_ChatQuickBar.prototype.initialize = function (rect, label) {
        this._label = String(label || "Chat…");
        Window_Selectable.prototype.initialize.call(this, rect);
        this.refresh();
    };
    Window_ChatQuickBar.prototype.maxItems = function () { return 1; };
    Window_ChatQuickBar.prototype.itemHeight = function () { return this.lineHeight(); };
    Window_ChatQuickBar.prototype.drawItem = function (index) {
        const rect = this.itemLineRect(index);
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(this._label, rect.x, rect.y, rect.width, "center");
        this.resetTextColor();
    };
    Window_ChatQuickBar.prototype.isOkEnabled = function () { return true; };
    Window_ChatQuickBar.prototype.update = function () {
        Window_Selectable.prototype.update.call(this);
        // Activate only when player can input (no message/progress)
        if ($gameMessage && $gameMessage.isBusy && $gameMessage.isBusy()) {
            this.deactivate();
        } else {
            this.activate();
        }
    };

    Scene_Chat.prototype.openTextInputForNpc = function (npc) {
        // Simple approach: use prompt() in NW.js runtime; fallback to message if unavailable
        let text = null;
        try {
            if (typeof window !== "undefined" && window.prompt) {
                text = window.prompt("Message to " + (npc.name || ("Event " + npc.id)) + ":", "");
            }
        } catch (_) {
            text = null;
        }
        if (text && text.trim().length > 0) {
            const line = "Player says to " + (npc.name || ("Event " + npc.id)) + ": \"" + text.trim() + "\"";
            if (window.AICharacter && typeof window.AICharacter.addToGlobalHistory === "function") {
                window.AICharacter.addToGlobalHistory(line);
            }
            try {
                if (window.AICharacter && typeof window.AICharacter.addToNpcMemory === "function") {
                    window.AICharacter.addToNpcMemory({ mapId: $gameMap.mapId(), eventId: npc.id }, "Player says: \"" + String(text).trim() + "\"");
                }
            } catch (_) { }
            try {
                if (window.AICharacter && typeof window.AICharacter.invalidateNpcThinking === "function") {
                    window.AICharacter.invalidateNpcThinking({ mapId: $gameMap.mapId(), eventId: npc.id });
                }
            } catch (_) { }
            // Quick fix: clear any queued/stale NPC messages and close all menus
            try { if ($gameMessage && $gameMessage.clear) { $gameMessage.clear(); } } catch (_) { }
            SceneManager.goto(Scene_Map);
            return;
        }
        this.popScene();
    };

    function Window_ChatNpcList() {
        this.initialize(...arguments);
    }

    Window_ChatNpcList.prototype = Object.create(Window_Selectable.prototype);
    Window_ChatNpcList.prototype.constructor = Window_ChatNpcList;

    Window_ChatNpcList.prototype.initialize = function (rect, npcs) {
        this._npcs = Array.isArray(npcs) ? npcs : [];
        Window_Selectable.prototype.initialize.call(this, rect);
        this.refresh();
    };

    Window_ChatNpcList.prototype.maxItems = function () {
        return Math.max(1, this._npcs.length);
    };

    Window_ChatNpcList.prototype.itemHeight = function () {
        return this.lineHeight();
    };

    Window_ChatNpcList.prototype.drawItem = function (index) {
        const rect = this.itemLineRect(index);
        if (this._npcs.length === 0) {
            this.changeTextColor(ColorManager.textColor(8));
            this.drawText(ChatMenu_isNearbyOnly() ? "No adjacent NPCs" : "No NPCs on this map", rect.x, rect.y, rect.width, "left");
            this.resetTextColor();
            return;
        }
        const npc = this._npcs[index];
        const label = (npc.name || ("Event " + npc.id)) + "  (" + npc.x + "," + npc.y + ")";
        this.drawText(label, rect.x, rect.y, rect.width, "left");
    };

    Window_ChatNpcList.prototype.currentNpc = function () {
        if (this._npcs.length === 0) return null;
        return this._npcs[this.index()];
    };

    Window_ChatNpcList.prototype.isOkEnabled = function () {
        return this._npcs.length > 0;
    };
})();



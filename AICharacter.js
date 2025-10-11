/*:
 * @target MZ
 * @plugindesc v1.1 NPC AI via Mistral or GPT-5 (mini/nano). Set NPC description; decide and act. 
 * @author You
 * 
 * @param ApiKey
 * @text LLM API Key
 * @type string
 * @desc Secret API key for the selected provider. Prefer using Proxy URL in production.
 * @default 
 * 
 * @param Model
 * @text Model
 * @type string
 * @default mistral-large-latest
 * 
 * @param Provider
 * @text Provider
 * @type string
 * @desc Provider to use: 'mistral' or 'openai' (for gpt-5-mini/nano)
 * @default mistral
 * 
 * @param ApiBaseUrl
 * @text Mistral API Base URL
 * @type string
 * @default https://api.mistral.ai/v1/chat/completions
 * 
 * @param OpenAIBaseUrl
 * @text OpenAI API Base URL
 * @type string
 * @default https://api.openai.com/v1/chat/completions
 * 
 * @param ProxyUrl
 * @text Proxy URL (optional)
 * @type string
 * @desc If set, requests go to this URL (no Authorization header sent).
 * @default 
 * 
 * @param Temperature
 * @text Temperature
 * @type number
 * @decimals 2
 * @min 0
 * @max 2
 * @default 0.20
 * 
 * @param MaxTokens
 * @text Max Tokens
 * @type number
 * @default 200
 * 
 * @param EnableReplyChoice
 * @text Enable Reply Choice
 * @type boolean
 * @desc Show a quick "Antworten…" choice after NPC speaks to prompt the player.
 * @default true
 * 
 * @param ReplyChoiceLabel
 * @text Reply Choice Label
 * @type string
 * @desc Label for the in-dialog reply choice.
 * @default Antworten…
 * 
 * @param NpcMessageBackground
 * @text NPC Message Background
 * @type select
 * @option Inherit
 * @value inherit
 * @option Window
 * @value window
 * @option Dim (semi-transparent)
 * @value dim
 * @option Transparent
 * @value transparent
 * @desc Background style for NPC dialog messages.
 * @default inherit
 * 
 * @param NpcMessagePosition
 * @text NPC Message Position
 * @type select
 * @option Inherit
 * @value inherit
 * @option Top
 * @value top
 * @option Middle
 * @value middle
 * @option Bottom
 * @value bottom
 * @desc Screen position for NPC dialog messages.
 * @default inherit
 * 
 * @command SetNPCDescription
 * @text Set NPC Description
 * @desc Stores an AI description for this event (character, goals, situation).
 * @arg description
 * @text Description
 * @type note
 * @desc Describe the NPC's character, goals, and current situation.
 * 
 * @command DecideAndAct
 * @text Decide And Act
 * @desc Calls the LLM with environment and performs the chosen action.
 * 
 * @command DecideTowardGoal
 * @text Decide Toward Goal
 * @desc Goal-driven decision: perform one action and evaluate progress to set a result variable.
 * @arg goal
 * @text Goal
 * @type note
 * @desc Describe the goal the NPC should pursue right now.
 * @default 
 * @arg resultVariableId
 * @text Result Variable
 * @type variable
 * @desc Variable to set based on evaluation: 1=achieved, -1=failed, 0=continue
 * @default 0
 * @arg switchPolicy
 * @text Switch Policy (optional)
 * @type note
 * @desc Guidance on which switches (IDs) may be toggled to achieve the goal.
 * @default 
 * @arg allowedSwitchIds
 * @text Allowed Switch IDs (optional)
 * @type string
 * @desc Comma-separated switch IDs the NPC may toggle (e.g., "3,5,8"). Empty = no enforcement.
 * @default 
 * 
 * @help AICharacter.js
 * This plugin lets an NPC (event) decide its next action using Mistral Large.
 * 
 * USAGE
 * 1) Enable the plugin.
 * 2) Create an NPC event. Set a page to Parallel.
 * 3) On that page, call Plugin Command → AICharacter → Set NPC Description once.
 *    Put your NPC background/character/situation in the description box.
 * 4) Then repeatedly call Plugin Command → AICharacter → Decide And Act.
 *    You can loop it with a short Wait (e.g., 30 frames) between calls.
 * 
 * NPC MESSAGE WINDOW APPEARANCE
 * - Use the parameters "NPC Message Background" and "NPC Message Position" to control
 *   how the NPC dialog window looks when an AI NPC talks (speak/give):
 *   • Background: Inherit / Window / Dim / Transparent
 *   • Position:   Inherit / Top / Middle / Bottom
 * - "Inherit" leaves the engine's current message settings untouched.
 * - If you select Window/Dim/Transparent or a specific position, only the NPC's
 *   message is affected; the previous settings are restored afterward.
 * 
 * SECURITY
 * - For prototypes, set ApiKey directly. For release builds, prefer ProxyUrl so
 *   your key stays on your server.
 * 
 * ACTIONS
 * - move: targetX, targetY (tile coordinates). Engine will pathfind and take the first step.
 * - speak: text
 * - give: itemId (number), optional text
 * - wait: ms (50-1000)
 * 
 * TERMS
 * MIT License. Note that the plugin is completely LLM generated and doesn't reflect my own coding skills :-).
 */

(() => {
    "use strict";

    const pluginName = "AICharacter";

    const params = PluginManager.parameters(pluginName);
    const apiKey = String(params["ApiKey"] || "");
    const model = String(params["Model"] || "mistral-large-latest");
    const provider = String(params["Provider"] || "mistral").toLowerCase();
    const apiBaseUrl = String(params["ApiBaseUrl"] || "https://api.mistral.ai/v1/chat/completions");
    const openAIBaseUrl = String(params["OpenAIBaseUrl"] || "https://api.openai.com/v1/chat/completions");
    const proxyUrl = String(params["ProxyUrl"] || "");
    const temperature = Number(params["Temperature"] || 0.2);
    const maxTokens = Number(params["MaxTokens"] || 200);
    // Optional UX parameters
    const enableReplyChoice = String(params["EnableReplyChoice"] || "true").toLowerCase() === "true";
    const replyChoiceLabel = String(params["ReplyChoiceLabel"] || "Antworten…");
    // NPC message window appearance overrides (inherit by default)
    const npcMessageBackgroundParam = String(params["NpcMessageBackground"] || "inherit").toLowerCase().trim();
    const npcMessagePositionParam = String(params["NpcMessagePosition"] || "inherit").toLowerCase().trim();
    function parseBackgroundParam(p) {
        if (p === "window" || p === "0") return 0; // normal window
        if (p === "dim" || p === "semi" || p === "semitransparent" || p === "1") return 1; // dim
        if (p === "transparent" || p === "2") return 2; // fully transparent
        return -1; // inherit
    }
    function parsePositionParam(p) {
        if (p === "top" || p === "0") return 0;
        if (p === "middle" || p === "center" || p === "1") return 1;
        if (p === "bottom" || p === "2") return 2;
        return -1; // inherit
    }
    const npcMessageBackground = parseBackgroundParam(npcMessageBackgroundParam);
    const npcMessagePosition = parsePositionParam(npcMessagePositionParam);

    // Apply NPC message overrides just-in-time when a message actually starts
    const _AICharacter_Window_Message_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function () {
        try {
            const o = $gameSystem && $gameSystem._aiNpcMsgOverride;
            if (o) {
                if (o.bg != null && $gameMessage.setBackground) $gameMessage.setBackground(o.bg);
                if (o.pos != null && $gameMessage.setPositionType) $gameMessage.setPositionType(o.pos);
                $gameSystem._aiNpcMsgOverride = null;
            }
        } catch (_) { }
        _AICharacter_Window_Message_startMessage.call(this);
    };

    function setNpcMessageOverride(bg, pos) {
        if (!$gameSystem) return;
        const override = {};
        if (Number.isInteger(bg) && bg >= 0) override.bg = bg;
        if (Number.isInteger(pos) && pos >= 0) override.pos = pos;
        $gameSystem._aiNpcMsgOverride = override;
    }

    // Global action history configuration
    const MAX_GLOBAL_HISTORY = 100;
    const INCLUDE_MOVEMENT_IN_HISTORY = true; // Toggle to include/exclude movement entries

    function getGlobalHistory() {
        if (!$gameSystem._aiGlobalHistory) {
            $gameSystem._aiGlobalHistory = [];
        }
        return $gameSystem._aiGlobalHistory;
    }

    function addToGlobalHistory(line) {
        const history = getGlobalHistory();
        history.push(line);
        if (history.length > MAX_GLOBAL_HISTORY) {
            // Trim from the front to keep only the last MAX_GLOBAL_HISTORY
            history.splice(0, history.length - MAX_GLOBAL_HISTORY);
        }
    }

    // Expose a minimal public API so other plugins (e.g., ChatMenu) can append to history.
    if (typeof window !== "undefined") {
        window.AICharacter = window.AICharacter || {};
        window.AICharacter.addToGlobalHistory = addToGlobalHistory;
        window.AICharacter.getGlobalHistory = getGlobalHistory;
        // Prompt the player for a freeform reply to an NPC and log it to global history.
        // Accepts an NPC object with { id, name } or a plain string name.
        window.AICharacter.promptPlayerMessageToNpc = function (npcInfo) {
            try {
                const name = npcInfo && typeof npcInfo === "object" ? (npcInfo.name || ("Event " + (npcInfo.id || ""))) : String(npcInfo || "NPC");
                let text = null;
                if (typeof window !== "undefined" && window.prompt) {
                    text = window.prompt("Nachricht an " + name + ":", "");
                }
                if (text && String(text).trim().length > 0) {
                    const trimmed = String(text).trim();
                    addToGlobalHistory("Player says to " + name + ": \"" + shortenForHistory(trimmed) + "\"");
                }
            } catch (_) {
                // ignore prompt errors in non-browser contexts
            }
        };
    }

    function shortenForHistory(text, maxLen = 120) {
        const s = String(text || "").replace(/\s+/g, " ").trim();
        return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
    }

    function getStateMap() {
        if (!$gameSystem._aiCharacterState) {
            $gameSystem._aiCharacterState = {};
        }
        return $gameSystem._aiCharacterState;
    }

    function mapEventKey(mapId, eventId) {
        return mapId + ":" + eventId;
    }

    function getOrCreateNpcState(mapId, eventId) {
        const key = mapEventKey(mapId, eventId);
        const stateMap = getStateMap();
        if (!stateMap[key]) {
            stateMap[key] = { description: "", memory: [], isThinking: false, currentGoal: "" };
        }
        return stateMap[key];
    }

    PluginManager.registerCommand(pluginName, "SetNPCDescription", function (args) {
        const startTime = new Date();
        console.log(`[AICharacter] BEGIN SetNPCDescription - ${startTime.toISOString()}`);

        const description = args.description || "";
        const mapId = $gameMap.mapId();
        const eventId = this.eventId ? this.eventId() : 0;
        if (eventId <= 0) return;
        const s = getOrCreateNpcState(mapId, eventId);
        s.description = description;
        // console.log("[AICharacter] SetNPCDescription for event", eventId, "on map", mapId, ":", description.slice(0, 100));

        const endTime = new Date();
        console.log(`[AICharacter] END SetNPCDescription - ${endTime.toISOString()}`);
    });

    PluginManager.registerCommand(pluginName, "DecideAndAct", function () {
        const startTime = new Date();
        console.log(`[AICharacter] BEGIN DecideAndAct - ${startTime.toISOString()}`);

        const mapId = $gameMap.mapId();
        const eventId = this.eventId ? this.eventId() : 0;
        if (eventId <= 0) return;
        const state = getOrCreateNpcState(mapId, eventId);
        const npc = $gameMap.event(eventId);
        if (!npc) return;
        // Prevent overlapping LLM calls for the same NPC
        if (state.isThinking) {
            const endTimeBusy = new Date();
            console.log(`[AICharacter] SKIP DecideAndAct (busy) - ${endTimeBusy.toISOString()}`);
            return;
        }
        state.isThinking = true;
        const env = buildEnvironmentSnapshot(mapId, eventId, npc, state);
        // console.log("[AICharacter] DecideAndAct for event", eventId, "- Environment:", JSON.stringify(env, null, 2));
        const interpreter = this;
        callLlmForAction(env).then(action => {
            try {
                if (action) {
                    // Validate against current state to avoid stale moves
                    const validatedAction = validateActionAgainstCurrentState(action, npc);
                    performAction(validatedAction, npc, interpreter);
                } else {
                    // console.warn("[AICharacter] No valid action returned for event", eventId);
                }
            } finally {
                state.isThinking = false;
            }
            const endTime = new Date();
            console.log(`[AICharacter] END DecideAndAct - ${endTime.toISOString()}`);
        }).catch(e => {
            // console.error("[AICharacter] LLM error for event", eventId, ":", e);
            state.isThinking = false;
            const endTime = new Date();
            console.log(`[AICharacter] END DecideAndAct (error) - ${endTime.toISOString()}`);
        });
    });

    PluginManager.registerCommand(pluginName, "DecideTowardGoal", function (args) {
        const startTime = new Date();
        console.log(`[AICharacter] BEGIN DecideTowardGoal - ${startTime.toISOString()}`);

        const mapId = $gameMap.mapId();
        const eventId = this.eventId ? this.eventId() : 0;
        if (eventId <= 0) return;
        const state = getOrCreateNpcState(mapId, eventId);
        const npc = $gameMap.event(eventId);
        if (!npc) return;
        if (state.isThinking) {
            const endTimeBusy = new Date();
            console.log(`[AICharacter] SKIP DecideTowardGoal (busy) - ${endTimeBusy.toISOString()}`);
            return;
        }
        state.isThinking = true;

        const goal = (args.goal || "");
        const resultVariableId = Number(args.resultVariableId || 0) || 0;
        const switchPolicy = (args.switchPolicy || "");
        // Optional strict allowlist parsing: comma-separated numbers
        const allowedSwitchIds = String(args.allowedSwitchIds || "")
            .split(/[,\s]+/)
            .map(s => Number(s))
            .filter(n => Number.isFinite(n) && n > 0);

        // Check if goal has changed and log it
        const trimmedGoal = String(goal).trim();
        if (state.currentGoal !== trimmedGoal) {
            const name = npc.event().name || "NPC";
            console.log(`[AICharacter] Event ${eventId} (${name}) new goal: ${trimmedGoal}`);
            state.currentGoal = trimmedGoal;
        }

        const env = buildEnvironmentSnapshot(mapId, eventId, npc, state);
        const interpreter = this;

        callLlmForGoal(env, state.description, goal, switchPolicy).then(result => {
            try {
                if (result) {
                    let { action, status } = result;
                    // Prevent LLM from directly setting variables in goal flow; engine owns result variable
                    if (action && action.type === "setVariable") {
                        action = { type: "wait", ms: 200 };
                    }
                    // If an allowlist was provided, block switch toggles that aren't allowed
                    if (action && action.type === "setSwitch" && allowedSwitchIds.length > 0) {
                        const id = Number(action.switchId != null ? action.switchId : action.id || 0);
                        if (!allowedSwitchIds.includes(id)) {
                            action = { type: "wait", ms: 200 };
                        }
                    }
                    const validated = validateActionAgainstCurrentState(action, npc);
                    performAction(validated, npc, interpreter);

                    // Map status -> variable
                    const resultValue = goalStatusToVariableValue(status);
                    if (resultVariableId > 0) {
                        performAction({ type: "setVariable", variableId: resultVariableId, value: resultValue }, npc, interpreter);
                    }
                    const name = npc.event().name || "NPC";
                    addToGlobalHistory(name + " evaluates goal: " + status + (resultVariableId > 0 ? (" (Var " + resultVariableId + "=" + resultValue + ")") : ""));
                }
            } finally {
                state.isThinking = false;
            }
            const endTime = new Date();
            console.log(`[AICharacter] END DecideTowardGoal - ${endTime.toISOString()}`);
        }).catch(e => {
            state.isThinking = false;
            const endTime = new Date();
            console.log(`[AICharacter] END DecideTowardGoal (error) - ${endTime.toISOString()}`);
        });
    });

    function buildEnvironmentSnapshot(mapId, eventId, npc, state) {
        const player = $gamePlayer;
        // Distances are Manhattan distances relative to the current NPC
        const dxPlayer = player.x - npc.x;
        const dyPlayer = player.y - npc.y;
        const playerDistance = Math.abs(dxPlayer) + Math.abs(dyPlayer);
        const playerIsAdjacent = playerDistance === 1;
        const otherNpcs = $gameMap.events()
            .filter(e => e.eventId() !== eventId)
            .map(e => {
                const dx = e.x - npc.x;
                const dy = e.y - npc.y;
                const distance = Math.abs(dx) + Math.abs(dy);
                const isAdjacent = distance === 1;
                return { id: e.eventId(), name: e.event().name, x: e.x, y: e.y, distance: distance, isAdjacent: isAdjacent };
            });
        return {
            npc: { id: eventId, name: npc.event().name, x: npc.x, y: npc.y, description: state.description },
            player: { x: player.x, y: player.y, distance: playerDistance, isAdjacent: playerIsAdjacent },
            others: otherNpcs,
            map: { id: mapId, width: $gameMap.width(), height: $gameMap.height(), displayName: ($dataMap && $dataMap.displayName) || "" },
            time: Date.now()
        };
    }

    async function callLlmForAction(env) {
        const systemPrompt = "You control an NPC in a RPG Maker MZ game. Important: The whole game is in the German language. All characters talk in German. In the environment below your NPC is called 'npc'. Choose ONE action as JSON with keys: action.type in [move,speak,give,wait]. For move, DO NOT choose a direction; instead include targetX and targetY as tile coordinates of where you want to go (e.g., the player's coordinates). The engine will compute the path and take the first step. For speak include text; for give include itemId (number) and optional text to say; for wait include ms (500-1000). Output ONLY minified JSON.\n\nPROXIMITY POLICY:\n- Environment provides player.distance (Manhattan) and player.isAdjacent.\n- If player.isAdjacent is true, prefer speak/give/wait over move.\n- Apply the same consideration when interacting with 'others' entries that are adjacent.\nEXAMPLES:\n- Move toward player: {\"type\":\"move\",\"targetX\":player.x,\"targetY\":player.y}\n- Speak in German when adjacent: {\"type\":\"speak\",\"text\":\"…\"}";
        const recentHistory = getGlobalHistory();
        const historyHeader = recentHistory.length ? "Recent history (latest last):\n" : "";
        const historyBlock = recentHistory.length ? historyHeader + recentHistory.join("\n") + "\n\n" : "";
        const userPrompt = historyBlock + "Environment:\n" + JSON.stringify(env, null, 2) + "\nChoose the next action.";
        const usingMistral = provider === "mistral";
        const body = {
            model: model,
            //max_tokens: maxTokens,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]
        };
        // Only include temperature for Mistral; GPT-5 models don't support it
        if (usingMistral) {
            body.temperature = temperature;
        }
        const url = proxyUrl ? proxyUrl : (usingMistral ? apiBaseUrl : openAIBaseUrl);
        const headers = { "Content-Type": "application/json" };
        if (!proxyUrl) {
            if (!apiKey) {
                // console.warn("[AICharacter] Missing ApiKey; cannot call provider.");
                return null;
            }
            headers["Authorization"] = "Bearer " + apiKey;
        }
        // console.log("[AICharacter] Calling LLM API at", url, "with model", model);
        // console.log("[AICharacter] Request body:", JSON.stringify(body, null, 2));
        const resText = await httpPostJson(url, headers, body);
        // console.log("[AICharacter] Raw response:", resText);
        if (!resText) {
            // console.warn("[AICharacter] Empty response from API");
            return null;
        }
        let content = null;
        try {
            const parsed = JSON.parse(resText);
            if (parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content) {
                content = parsed.choices[0].message.content;
                // console.log("[AICharacter] Extracted content from choices[0].message.content:", content);
            } else {
                content = resText; // proxy may already return the action JSON
                // console.log("[AICharacter] Using raw response as content (proxy mode?)");
            }
        } catch (_) {
            content = resText;
            // console.log("[AICharacter] Failed to parse response as JSON, using raw text");
        }
        try {
            const action = JSON.parse(content);
            // console.log("[AICharacter] Parsed action JSON:", JSON.stringify(action));
            const sanitized = sanitizeAction(action);
            // console.log("[AICharacter] Sanitized action:", JSON.stringify(sanitized));
            return sanitized;
        } catch (err) {
            // console.error("[AICharacter] Failed to parse LLM action JSON:", content, err);
            return null;
        }
    }

    async function callLlmForGoal(env, npcDescription, goalText, switchPolicy) {
        const systemPrompt = "You control an NPC in a RPG Maker MZ game. Important: The whole game is in the German language. All characters talk in German. In the environment below your NPC is called 'npc'. Pursue the given goal. Think first, then choose ONE immediate action that best advances the goal. Respond ONLY as JSON using the EXACT schema: action.type in [move,speak,give,wait,setSwitch]; for move include targetX and targetY (tile coordinates of the desired destination, e.g., the player's coordinates); for speak include text; for give include itemId (number) and optional text; for wait include ms (500-1000); for setSwitch include switchId (number) and value (true/false). The top-level object MUST be {action:{...},goal:{status,why}}. goal.status MUST be one of [achieved,failed,continue]. Do NOT set variables yourself; the engine will set the result variable. Do NOT use formats like 'speak=...'. Output ONLY minified JSON.\nIMPORTANT for move: For move, DO NOT choose a direction; instead include targetX and targetY as tile coordinates of where you want to go (e.g., the player's coordinates). The engine will compute the path and take the first step. .\nPROXIMITY POLICY:\nFor Player and other NPCs, the environment provides the distance to you and isAdjancent.\nGOAL EVALUATION:\n- After choosing the action, evaluate whether the goal is achieved, failed, or should continue, and include a short 'why'.";
        const recentHistory = getGlobalHistory();
        const historyHeader = recentHistory.length ? "Recent history (latest last):\n" : "";
        const historyBlock = recentHistory.length ? historyHeader + recentHistory.join("\n") + "\n\n" : "";
        const goalBlock = "Goal:\n" + String(goalText || "").trim() + "\n\n";
        const descBlock = npcDescription ? ("NPC Description:\n" + String(npcDescription).trim() + "\n\n") : "";
        const policyBlock = String(switchPolicy || "").trim() ? ("Switch Policy (allowed and when to use):\n" + String(switchPolicy).trim() + "\n\n") : "";
        const userPrompt = historyBlock + descBlock + goalBlock + policyBlock + "Environment:\n" + JSON.stringify(env, null, 2) + "\nReturn only JSON with {action,goal}.";

        const usingMistral = provider === "mistral";
        const body = {
            model: model,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]
        };
        if (usingMistral) {
            body.temperature = temperature;
        }
        const url = proxyUrl ? proxyUrl : (usingMistral ? apiBaseUrl : openAIBaseUrl);
        const headers = { "Content-Type": "application/json" };
        if (!proxyUrl) {
            if (!apiKey) return null;
            headers["Authorization"] = "Bearer " + apiKey;
        }
        const resText = await httpPostJson(url, headers, body);
        if (!resText) return null;
        let content = null;
        try {
            const parsed = JSON.parse(resText);
            if (parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content) {
                content = parsed.choices[0].message.content;
            } else {
                content = resText;
            }
        } catch (_) {
            content = resText;
        }
        try {
            const obj = JSON.parse(content);
            console.log("[AICharacter] callLlmForGoal parsed response:", JSON.stringify(obj, null, 2));
            const rawAction = obj.action || obj.Action || null;
            const rawGoal = obj.goal || obj.Goal || {};
            let action = rawAction ? sanitizeAction(rawAction) : { type: "wait", ms: 200 };
            const status = sanitizeGoalStatus(rawGoal.status);
            return { action, status };
        } catch (err) {
            console.error("[AICharacter] callLlmForGoal failed to parse JSON:", content, err);
            return null;
        }
    }

    function sanitizeGoalStatus(status) {
        const s = String(status || "").trim().toLowerCase();
        if (s === "achieved" || s === "success" || s === "done") return "achieved";
        if (s === "failed" || s === "failure" || s === "impossible") return "failed";
        return "continue";
    }

    function goalStatusToVariableValue(status) {
        switch (status) {
            case "achieved": return 1;
            case "failed": return -1;
            default: return 0;
        }
    }

    function sanitizeAction(action) {
        // Handle nested action object: { action: { type: "...", ... } }
        let actionData = action;
        if (action.action && typeof action.action === "object") {
            // console.log("[AICharacter] Detected nested action object, unwrapping");
            actionData = action.action;
        }
        // console.log("[AICharacter] sanitizeAction input:", JSON.stringify(actionData));
        const safe = { type: String(actionData.type || "wait") };
        // console.log("[AICharacter] safe.type after assignment:", safe.type);
        if (safe.type === "move") {
            // Primary: target coordinates
            let targetX = null;
            let targetY = null;
            if (actionData.target && typeof actionData.target === "object") {
                targetX = Number(actionData.target.x != null ? actionData.target.x : actionData.target.X);
                targetY = Number(actionData.target.y != null ? actionData.target.y : actionData.target.Y);
            }
            if (targetX == null) targetX = Number(actionData.targetX != null ? actionData.targetX : (actionData.x != null ? actionData.x : actionData.X));
            if (targetY == null) targetY = Number(actionData.targetY != null ? actionData.targetY : (actionData.y != null ? actionData.y : actionData.Y));
            if (Number.isFinite(targetX) && Number.isFinite(targetY)) {
                safe.targetX = Math.floor(targetX);
                safe.targetY = Math.floor(targetY);
            }
            // Backward compatibility: some models may still return a direction/steps
            const dir = String(actionData.direction || "").toLowerCase();
            const steps = Math.max(1, Math.min(3, Number(actionData.steps || 1)));
            if (dir) safe.direction = dir;
            if (Number.isFinite(steps)) safe.steps = steps;
        } else if (safe.type === "speak") {
            safe.text = String(actionData.text || "").slice(0, 240);
        } else if (safe.type === "give") {
            safe.itemId = Number(actionData.itemId || 1);
            safe.text = (actionData.text ? String(actionData.text) : "");
        } else if (safe.type === "setSwitch") {
            // Allow switchId or id; coerce value to boolean
            const rawId = Number(actionData.switchId != null ? actionData.switchId : actionData.id || 0);
            const normalizedId = Math.max(1, Math.floor(isNaN(rawId) ? 0 : rawId));
            let rawValue = actionData.value;
            let boolValue = false;
            if (typeof rawValue === "boolean") {
                boolValue = rawValue;
            } else if (typeof rawValue === "number") {
                boolValue = rawValue !== 0;
            } else if (typeof rawValue === "string") {
                const v = rawValue.trim().toLowerCase();
                boolValue = v === "true" || v === "on" || v === "1";
            }
            safe.switchId = normalizedId;
            safe.value = !!boolValue;
        } else if (safe.type === "setVariable") {
            // Allow variableId or id; accept any primitive value
            const rawId = Number(actionData.variableId != null ? actionData.variableId : actionData.id || 0);
            const normalizedId = Math.max(1, Math.floor(isNaN(rawId) ? 0 : rawId));
            let value = actionData.value;
            // If value is an object/array, ignore and default to 0 to avoid complex structures
            if (value != null && typeof value === "object") {
                value = 0;
            }
            safe.variableId = normalizedId;
            safe.value = value != null ? value : 0;
        } else if (safe.type === "wait") {
            safe.ms = Math.max(50, Math.min(1000, Number(actionData.ms || 200)));
        }
        return safe;
    }

    function wrapTextForDialog(text, maxWidth = 58) {
        const words = text.split(/\s+/);
        const lines = [];
        let currentLine = "";

        for (const word of words) {
            if (currentLine.length === 0) {
                // First word on the line
                currentLine = word;
            } else if (currentLine.length + 1 + word.length <= maxWidth) {
                // Adding a space and the word still fits
                currentLine += " " + word;
            } else {
                // Adding the word would exceed the limit, start a new line
                lines.push(currentLine);
                currentLine = word;
            }
        }

        // Don't forget the last line
        if (currentLine.length > 0) {
            lines.push(currentLine);
        }

        return lines.join("\n");
    }

    function validateActionAgainstCurrentState(action, npc) {
        if (!action || typeof action !== "object") {
            return { type: "wait", ms: 500 };
        }
        if (action.type === "move") {
            // If target coordinates exist, ensure they are within map bounds and not identical to current position
            if (Number.isFinite(action.targetX) && Number.isFinite(action.targetY)) {
                const tx = Math.max(0, Math.min($gameMap.width() - 1, Math.floor(action.targetX)));
                const ty = Math.max(0, Math.min($gameMap.height() - 1, Math.floor(action.targetY)));
                if (tx === npc.x && ty === npc.y) {
                    return { type: "wait", ms: 300 };
                }
                return { type: "move", targetX: tx, targetY: ty };
            }
            // Fallback: legacy direction-based move validation
            const player = $gamePlayer;
            const dx = player.x - npc.x;
            const dy = player.y - npc.y;
            const currentDistance = Math.abs(dx) + Math.abs(dy);
            if (currentDistance === 1) {
                return { type: "wait", ms: 500 };
            }
            const delta = directionStringToDelta(String(action.direction || "").toLowerCase());
            if (!delta) {
                return { type: "wait", ms: 500 };
            }
            const newNpcX = npc.x + delta.x;
            const newNpcY = npc.y + delta.y;
            const newDx = player.x - newNpcX;
            const newDy = player.y - newNpcY;
            const newDistance = Math.abs(newDx) + Math.abs(newDy);
            if (newDistance >= currentDistance) {
                return { type: "wait", ms: 500 };
            }
            return action;
        }
        return action;
    }

    function directionStringToDelta(dir) {
        switch (dir) {
            case "up": return { x: 0, y: -1 };
            case "down": return { x: 0, y: 1 };
            case "left": return { x: -1, y: 0 };
            case "right": return { x: 1, y: 0 };
            default: return null;
        }
    }

    // Compute the next direction (2,4,6,8) for the NPC to move one step toward target using BFS.
    function computeNextDirectionTowardTarget(npc, targetX, targetY) {
        const width = $gameMap.width();
        const height = $gameMap.height();
        const startX = npc.x;
        const startY = npc.y;

        const clampedTargetX = Math.max(0, Math.min(width - 1, Math.floor(targetX)));
        const clampedTargetY = Math.max(0, Math.min(height - 1, Math.floor(targetY)));

        if (startX === clampedTargetX && startY === clampedTargetY) return null;

        const startKey = startX + "," + startY;
        const goalKey = clampedTargetX + "," + clampedTargetY;

        const queue = [];
        const visited = new Set();
        const cameFrom = Object.create(null); // key -> { prevKey, dir }

        function manhattan(x1, y1, x2, y2) {
            return Math.abs(x1 - x2) + Math.abs(y1 - y2);
        }

        let bestKey = startKey;
        let bestDist = manhattan(startX, startY, clampedTargetX, clampedTargetY);

        queue.push({ x: startX, y: startY });
        visited.add(startKey);

        // Try directions in an order that roughly biases toward target
        function orderedDirs(cx, cy) {
            const dirs = [2, 4, 6, 8]; // down, left, right, up
            const dx = clampedTargetX - cx;
            const dy = clampedTargetY - cy;
            const horizFirst = Math.abs(dx) >= Math.abs(dy);
            if (horizFirst) {
                return dx >= 0 ? [6, 4, dy >= 0 ? 2 : 8, dy >= 0 ? 8 : 2] : [4, 6, dy >= 0 ? 2 : 8, dy >= 0 ? 8 : 2];
            } else {
                return dy >= 0 ? [2, 8, dx >= 0 ? 6 : 4, dx >= 0 ? 4 : 6] : [8, 2, dx >= 0 ? 6 : 4, dx >= 0 ? 4 : 6];
            }
        }

        const maxNodes = width * height;
        let nodesProcessed = 0;

        while (queue.length > 0 && nodesProcessed < maxNodes) {
            const { x: cx, y: cy } = queue.shift();
            nodesProcessed++;

            const cKey = cx + "," + cy;
            if (cKey === goalKey) {
                bestKey = cKey;
                break;
            }

            const dirs = orderedDirs(cx, cy);
            for (let i = 0; i < dirs.length; i++) {
                const d = dirs[i];
                // Use engine passability with the actual NPC for collisions
                if (!npc.canPass(cx, cy, d)) continue;
                let nx = cx;
                let ny = cy;
                if (d === 2) ny += 1; // down
                else if (d === 4) nx -= 1; // left
                else if (d === 6) nx += 1; // right
                else if (d === 8) ny -= 1; // up
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                const nKey = nx + "," + ny;
                if (visited.has(nKey)) continue;
                visited.add(nKey);
                cameFrom[nKey] = { prevKey: cKey, dir: d };
                queue.push({ x: nx, y: ny });
                const dist = manhattan(nx, ny, clampedTargetX, clampedTargetY);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestKey = nKey;
                }
            }
        }

        if (bestKey === startKey) return null; // no movement possible

        // Reconstruct first step from start to bestKey/goal
        let stepKey = bestKey;
        let prev = cameFrom[stepKey];
        // Walk back until the previous node is the start
        while (prev && prev.prevKey !== startKey) {
            stepKey = prev.prevKey;
            prev = cameFrom[stepKey];
        }
        return prev ? prev.dir : null;
    }

    function performAction(action, npc, interpreter) {
        // console.log("[AICharacter] Performing action:", action.type, "for event", npc.eventId());
        const name = npc.event().name || "NPC";
        switch (action.type) {
            case "move": {
                let moved = false;
                if (Number.isFinite(action.targetX) && Number.isFinite(action.targetY)) {
                    const dir = computeNextDirectionTowardTarget(npc, action.targetX, action.targetY);
                    if (dir) {
                        npc.moveStraight(dir);
                        moved = true;
                        if (INCLUDE_MOVEMENT_IN_HISTORY) {
                            addToGlobalHistory(name + " moves toward (" + Math.floor(action.targetX) + "," + Math.floor(action.targetY) + ")");
                        }
                    }
                }
                // Backward compatibility: if no target or no path, attempt legacy direction once
                if (!moved && action.direction) {
                    const dirNum = directionStringToNum(action.direction);
                    npc.moveStraight(dirNum);
                    moved = true;
                    if (INCLUDE_MOVEMENT_IN_HISTORY) {
                        addToGlobalHistory(name + " moves " + String(action.direction || "").toLowerCase());
                    }
                }
                if (!moved) {
                    const frames = Math.floor((action.ms || 200) / 16);
                    interpreter.wait(frames);
                    addToGlobalHistory(name + " waits " + (action.ms || 200) + "ms");
                }
                break;
            }
            case "speak": {
                if (action.text) {
                    // console.log("[AICharacter] Speaking:", action.text);
                    // Defer application to Window_Message.startMessage
                    setNpcMessageOverride(npcMessageBackground, npcMessagePosition);
                    const wrappedText = wrapTextForDialog(String(action.text));
                    $gameMessage.setSpeakerName(name);
                    $gameMessage.add(wrappedText);
                    if (interpreter && interpreter.setWaitMode) {
                        interpreter.setWaitMode("message");
                    }
                    addToGlobalHistory(name + " says \"" + shortenForHistory(action.text) + "\"");
                    // Optional: offer a quick reply button inside the dialog
                    if (enableReplyChoice && $gameMessage && $gameMessage.setChoices) {
                        try {
                            const choices = [replyChoiceLabel, "Weiter"];
                            // default index = 0 (reply), cancel index = 1 (continue)
                            $gameMessage.setChoices(choices, 0, 1);
                            if ($gameMessage.setChoiceCallback) {
                                $gameMessage.setChoiceCallback((n) => {
                                    if (n === 0) {
                                        const info = { id: npc.eventId(), name: name };
                                        if (typeof window !== "undefined" && window.AICharacter && typeof window.AICharacter.promptPlayerMessageToNpc === "function") {
                                            window.AICharacter.promptPlayerMessageToNpc(info);
                                        } else {
                                            // Fallback prompt
                                            try {
                                                const t = window.prompt("Nachricht an " + name + ":", "");
                                                if (t && String(t).trim()) {
                                                    addToGlobalHistory("Player says to " + name + ": \"" + shortenForHistory(String(t).trim()) + "\"");
                                                }
                                            } catch (_) { }
                                        }
                                    }
                                });
                            }
                        } catch (_) {
                            // If choices cannot be shown here, silently skip
                        }
                    }
                }
                break;
            }
            case "give": {
                const item = $dataItems[action.itemId];
                if (item) {
                    // console.log("[AICharacter] Giving item", action.itemId, "(", item.name, ") to player");
                    // Defer application to Window_Message.startMessage
                    setNpcMessageOverride(npcMessageBackground, npcMessagePosition);
                    $gameParty.gainItem(item, 1);
                    if (action.text) {
                        $gameMessage.add(name + ": " + action.text);
                    } else {
                        $gameMessage.add(name + " gave you " + item.name + ".");
                    }
                    if (action.text) {
                        addToGlobalHistory(name + " gives " + item.name + " to player and says \"" + shortenForHistory(action.text) + "\"");
                    } else {
                        addToGlobalHistory(name + " gives " + item.name + " to player");
                    }
                } else {
                    // console.warn("[AICharacter] Item ID", action.itemId, "not found in $dataItems");
                }
                break;
            }
            case "setSwitch": {
                const id = Number(action.switchId != null ? action.switchId : action.id || 0);
                if (id > 0) {
                    let val = action.value;
                    if (typeof val === "string") {
                        const v = val.trim().toLowerCase();
                        val = (v === "true" || v === "on" || v === "1");
                    } else {
                        val = !!val;
                    }
                    $gameSwitches.setValue(id, !!val);
                    addToGlobalHistory(name + " sets Switch " + id + " " + (!!val ? "ON" : "OFF"));
                }
                break;
            }
            case "setVariable": {
                const id = Number(action.variableId != null ? action.variableId : action.id || 0);
                if (id > 0) {
                    $gameVariables.setValue(id, action.value);
                    addToGlobalHistory(name + " sets Variable " + id + " to " + String(action.value));
                }
                break;
            }
            case "wait":
            default: {
                const frames = Math.floor((action.ms || 200) / 16);
                // console.log("[AICharacter] Waiting", action.ms || 200, "ms (", frames, "frames)");
                interpreter.wait(frames);
                addToGlobalHistory(name + " waits " + (action.ms || 200) + "ms");
                break;
            }
        }
    }

    function directionStringToNum(dir) {
        switch (dir) {
            case "up": return 8;
            case "down": return 2;
            case "left": return 4;
            case "right": return 6;
            default: return 2;
        }
    }

    async function httpPostJson(url, headers, body) {
        if (typeof fetch === "function") {
            const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
            return await res.text();
        }
        return await new Promise((resolve, reject) => {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open("POST", url);
                Object.keys(headers).forEach(k => xhr.setRequestHeader(k, headers[k]));
                xhr.onload = () => resolve(xhr.responseText);
                xhr.onerror = () => reject(new Error("Network error"));
                xhr.send(JSON.stringify(body));
            } catch (e) {
                reject(e);
            }
        });
    }
})();




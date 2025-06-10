/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { definePluginSettings } from "@api/Settings";
import { enableStyle } from "@api/Styles";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, FluxDispatcher, SelectedChannelStore } from "@webpack/common";

import style from "./MissionofBurma.css?managed";

const animatedMessages = new Set<string>();
const messageIntervals = new Map<string, NodeJS.Timeout>();
const logger = new Logger("TypewriterAnimatedMessages");
const TYPING_FLAG = 1 << 14; // 16384, right?

const enum ChannelType {
    DM = 1,
    GROUP_DM = 3,
}

const settings = definePluginSettings({
    speed: {
        type: OptionType.NUMBER,
        description: "The speed of the typewriter effect/delay between each letter in milliseconds.",
        default: 35,
        placeholder: "35"
    },
    // enableGlow: {
    //     type: OptionType.BOOLEAN,
    //     description: "Enable glow effect on typed characters",
    //     default: true
    // }, have to figure out how this is done
    showCursor: {
        type: OptionType.BOOLEAN,
        description: "Select whether the cursor at the end of the message should appear as it's typing.",
        default: true
    },
    channels: {
        type: OptionType.STRING,
        description: "Channel IDs where typing effect is enabled (comma-separated)",
        default: "",
        placeholder: "1234567890,0987654321,1015060231060983891"
    },
    channelTypeToAffect: {
        type: OptionType.SELECT,
        description: "What type of channel to enable the animation (All, DMs, GroupDMs, etc.).",
        options: [
            { label: "Direct Messages Only", value: "user_dm" },
            { label: "Group DMs Only", value: "group_dm" },
            { label: "All DMs", value: "all_dm" },
            { label: "All Channels", value: "all_chan", default: true },
        ]
    }
});

function isChannelEnabled(channelId: string): boolean {
    const enabledChannels = settings.store.channels
        .split(",")
        .map(id => id.trim())
        .filter(Boolean);
    if (enabledChannels.includes(channelId))
        return true;

    const channelType = ChannelStore.getChannel(channelId)?.type;
    const isDM = channelType === ChannelType.DM;
    const isGroupDM = channelType === ChannelType.GROUP_DM;
    const selection = settings.store.channelTypeToAffect;
    if (selection === "all_chan")
        return true;
    else if (isDM && selection === "user_dm")
        return true;
    else if (isGroupDM && selection === "group_dm")
        return true;
    else return isDM || isGroupDM && selection === "all_dm";
}

function onMessage({ optimistic, type, message, channelId }) {
    if (optimistic || type !== "MESSAGE_CREATE") return;
    if (message.state === "SENDING") return;
    if (!message.content) return;
    if (channelId !== SelectedChannelStore.getChannelId()) return;
    if (animatedMessages.has(message.id)) return;
    if (!isChannelEnabled(channelId)) return;
    animatedMessages.add(message.id);
    let currentContent = "";
    const fullContent = message.content!;
    let currentIndex = 0;
    if (messageIntervals.has(message.id))
        clearInterval(messageIntervals.get(message.id)!);

    const interval = setInterval(() => {
        if (currentIndex >= fullContent.length) {
            clearInterval(interval);
            messageIntervals.delete(message.id);
            animatedMessages.delete(message.id);

            FluxDispatcher.dispatch({
                type: "MESSAGE_UPDATE",
                message: {
                    ...message,
                    content: fullContent,
                    embeds: message.embeds,
                    attachments: message.attachments,
                    components: message.components,
                    flags: message.flags & ~TYPING_FLAG
                }
            });
            return;
        }

        currentContent += fullContent[currentIndex++];

        FluxDispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            message: {
                ...message,
                content: currentContent + (settings.store.showCursor ? "▮" : ""),
                embeds: null, // if this isn't null then prepare for your epilepsy testing
                attachments: null,
                components: null,
                flags: message.flags | TYPING_FLAG
            }
        });


    }, settings.store.speed);
    messageIntervals.set(message.id, interval);
}

export default definePlugin({
    name: "TypewriterAnimatedMessages",
    description: "Types out messages character by character",
    authors: [Devs.haz],
    settings,
    patches: [
        {
            find: "Message must not be a thread starter message", // thank you to all authors of messageLogger
            replacement: [
                {
                    match: /\)\("li",\{(.+?),className:/,
                    replace:
                        ")(\"li\",{$1,className:((arguments[0].message.flags & " + TYPING_FLAG + ") ? \"typing-glow \" : \"\") +"
                }
            ]
        }
    ],
    start() {
        enableStyle(style);
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessage);
    },
    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessage);
        for (const iv of messageIntervals.values()) clearInterval(iv);
        messageIntervals.clear();
        animatedMessages.clear();
    }
});


/*

    const { promise: imgLoaded, resolve } = Promise.withResolvers();

    const img = new Image();
    img.onload = resolve;
    img.crossOrigin = "anonymous";
    img.src = src;

    await imgLoaded;

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;

    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    ctx.clip();

    ctx.drawImage(img, 0, 0, size, size);

    return canvas.toDataURL();

    im so sorry i just stole this off of the guy who was talking about it in #plugin-development but i could make
    it so that when there's media it could generate it top to bottom like old computers did,
    or SUPER old ones where it was right to left pixel by pixel (that would be... an interesting addition i think)
 */

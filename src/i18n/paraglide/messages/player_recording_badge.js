/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_Recording_BadgeInputs */

const uk_player_recording_badge = /** @type {(inputs: Player_Recording_BadgeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Запис`)
};

const en_player_recording_badge = /** @type {(inputs: Player_Recording_BadgeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Recording`)
};

/**
* | output |
* | --- |
* | "Recording" |
*
* @param {Player_Recording_BadgeInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_recording_badge = /** @type {((inputs?: Player_Recording_BadgeInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_Recording_BadgeInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_recording_badge(inputs)
	return en_player_recording_badge(inputs)
});
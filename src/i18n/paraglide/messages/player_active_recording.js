/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_Active_RecordingInputs */

const uk_player_active_recording = /** @type {(inputs: Player_Active_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Активний запис`)
};

const en_player_active_recording = /** @type {(inputs: Player_Active_RecordingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Active recording`)
};

/**
* | output |
* | --- |
* | "Active recording" |
*
* @param {Player_Active_RecordingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_active_recording = /** @type {((inputs?: Player_Active_RecordingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_Active_RecordingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_active_recording(inputs)
	return en_player_active_recording(inputs)
});
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Action_StopInputs */

const uk_songs_action_stop = /** @type {(inputs: Songs_Action_StopInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зупинити`)
};

const en_songs_action_stop = /** @type {(inputs: Songs_Action_StopInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stop`)
};

/**
* | output |
* | --- |
* | "Stop" |
*
* @param {Songs_Action_StopInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_action_stop = /** @type {((inputs?: Songs_Action_StopInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Action_StopInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_action_stop(inputs)
	return en_songs_action_stop(inputs)
});
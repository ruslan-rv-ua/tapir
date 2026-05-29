/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Playback_PositionInputs */

const uk_playback_position = /** @type {(inputs: Playback_PositionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Позиція відтворення`)
};

const en_playback_position = /** @type {(inputs: Playback_PositionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Playback position`)
};

/**
* | output |
* | --- |
* | "Playback position" |
*
* @param {Playback_PositionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const playback_position = /** @type {((inputs?: Playback_PositionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Playback_PositionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_playback_position(inputs)
	return en_playback_position(inputs)
});
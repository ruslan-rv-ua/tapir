/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Zone_PlayerInputs */

const uk_zone_player = /** @type {(inputs: Zone_PlayerInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Програвач`)
};

const en_zone_player = /** @type {(inputs: Zone_PlayerInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Player`)
};

/**
* | output |
* | --- |
* | "Player" |
*
* @param {Zone_PlayerInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const zone_player = /** @type {((inputs?: Zone_PlayerInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Zone_PlayerInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_zone_player(inputs)
	return en_zone_player(inputs)
});
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_NextInputs */

const uk_player_next = /** @type {(inputs: Player_NextInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Наступний потік`)
};

const en_player_next = /** @type {(inputs: Player_NextInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Next stream`)
};

/**
* | output |
* | --- |
* | "Next stream" |
*
* @param {Player_NextInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_next = /** @type {((inputs?: Player_NextInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_NextInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_next(inputs)
	return en_player_next(inputs)
});
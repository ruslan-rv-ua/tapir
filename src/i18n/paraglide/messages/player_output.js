/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_OutputInputs */

const uk_player_output = /** @type {(inputs: Player_OutputInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Вивід`)
};

const en_player_output = /** @type {(inputs: Player_OutputInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Output`)
};

/**
* | output |
* | --- |
* | "Output" |
*
* @param {Player_OutputInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_output = /** @type {((inputs?: Player_OutputInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_OutputInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_output(inputs)
	return en_player_output(inputs)
});
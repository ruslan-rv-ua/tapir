/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_PrevInputs */

const uk_player_prev = /** @type {(inputs: Player_PrevInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Попередній трек`)
};

const en_player_prev = /** @type {(inputs: Player_PrevInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Previous track`)
};

/**
* | output |
* | --- |
* | "Previous track" |
*
* @param {Player_PrevInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_prev = /** @type {((inputs?: Player_PrevInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_PrevInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_prev(inputs)
	return en_player_prev(inputs)
});
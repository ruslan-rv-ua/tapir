/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_RestartedInputs */

const uk_player_restarted = /** @type {(inputs: Player_RestartedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Спочатку треку`)
};

const en_player_restarted = /** @type {(inputs: Player_RestartedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Restarting track`)
};

/**
* | output |
* | --- |
* | "Restarting track" |
*
* @param {Player_RestartedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_restarted = /** @type {((inputs?: Player_RestartedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_RestartedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_restarted(inputs)
	return en_player_restarted(inputs)
});
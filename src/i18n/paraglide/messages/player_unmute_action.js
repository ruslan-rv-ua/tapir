/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_Unmute_ActionInputs */

const uk_player_unmute_action = /** @type {(inputs: Player_Unmute_ActionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Увімкнути звук`)
};

const en_player_unmute_action = /** @type {(inputs: Player_Unmute_ActionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Unmute`)
};

/**
* | output |
* | --- |
* | "Unmute" |
*
* @param {Player_Unmute_ActionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_unmute_action = /** @type {((inputs?: Player_Unmute_ActionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_Unmute_ActionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_unmute_action(inputs)
	return en_player_unmute_action(inputs)
});
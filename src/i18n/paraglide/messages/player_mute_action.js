/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_Mute_ActionInputs */

const uk_player_mute_action = /** @type {(inputs: Player_Mute_ActionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Вимкнути звук`)
};

const en_player_mute_action = /** @type {(inputs: Player_Mute_ActionInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Mute`)
};

/**
* | output |
* | --- |
* | "Mute" |
*
* @param {Player_Mute_ActionInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_mute_action = /** @type {((inputs?: Player_Mute_ActionInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_Mute_ActionInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_mute_action(inputs)
	return en_player_mute_action(inputs)
});
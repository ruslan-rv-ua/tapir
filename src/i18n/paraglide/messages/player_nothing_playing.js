/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_Nothing_PlayingInputs */

const uk_player_nothing_playing = /** @type {(inputs: Player_Nothing_PlayingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Нічого не грає`)
};

const en_player_nothing_playing = /** @type {(inputs: Player_Nothing_PlayingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Nothing playing`)
};

/**
* | output |
* | --- |
* | "Nothing playing" |
*
* @param {Player_Nothing_PlayingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_nothing_playing = /** @type {((inputs?: Player_Nothing_PlayingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_Nothing_PlayingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_nothing_playing(inputs)
	return en_player_nothing_playing(inputs)
});
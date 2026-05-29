/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_Now_PlayingInputs */

const uk_player_now_playing = /** @type {(inputs: Player_Now_PlayingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зараз грає`)
};

const en_player_now_playing = /** @type {(inputs: Player_Now_PlayingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Now playing`)
};

/**
* | output |
* | --- |
* | "Now playing" |
*
* @param {Player_Now_PlayingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_now_playing = /** @type {((inputs?: Player_Now_PlayingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_Now_PlayingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_now_playing(inputs)
	return en_player_now_playing(inputs)
});
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Player_VolumeInputs */

const uk_player_volume = /** @type {(inputs: Player_VolumeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Гучність`)
};

const en_player_volume = /** @type {(inputs: Player_VolumeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Volume`)
};

/**
* | output |
* | --- |
* | "Volume" |
*
* @param {Player_VolumeInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const player_volume = /** @type {((inputs?: Player_VolumeInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Player_VolumeInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_player_volume(inputs)
	return en_player_volume(inputs)
});
/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} VolumeInputs */

const uk_volume = /** @type {(inputs: VolumeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Гучність`)
};

const en_volume = /** @type {(inputs: VolumeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Volume`)
};

/**
* | output |
* | --- |
* | "Volume" |
*
* @param {VolumeInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const volume = /** @type {((inputs?: VolumeInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<VolumeInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_volume(inputs)
	return en_volume(inputs)
});
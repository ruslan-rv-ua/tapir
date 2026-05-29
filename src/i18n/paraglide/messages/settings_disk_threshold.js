/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Disk_ThresholdInputs */

const uk_settings_disk_threshold = /** @type {(inputs: Settings_Disk_ThresholdInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Поріг диску (ГБ)`)
};

const en_settings_disk_threshold = /** @type {(inputs: Settings_Disk_ThresholdInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Disk threshold (GB)`)
};

/**
* | output |
* | --- |
* | "Disk threshold (GB)" |
*
* @param {Settings_Disk_ThresholdInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_disk_threshold = /** @type {((inputs?: Settings_Disk_ThresholdInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Disk_ThresholdInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_disk_threshold(inputs)
	return en_settings_disk_threshold(inputs)
});
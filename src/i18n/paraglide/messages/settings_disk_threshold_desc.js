/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Settings_Disk_Threshold_DescInputs */

const uk_settings_disk_threshold_desc = /** @type {(inputs: Settings_Disk_Threshold_DescInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зупинити запис при низькому місці на диску. 0 = вимкнено`)
};

const en_settings_disk_threshold_desc = /** @type {(inputs: Settings_Disk_Threshold_DescInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stop recording when disk space is low. 0 = disabled`)
};

/**
* | output |
* | --- |
* | "Stop recording when disk space is low. 0 = disabled" |
*
* @param {Settings_Disk_Threshold_DescInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const settings_disk_threshold_desc = /** @type {((inputs?: Settings_Disk_Threshold_DescInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Settings_Disk_Threshold_DescInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_settings_disk_threshold_desc(inputs)
	return en_settings_disk_threshold_desc(inputs)
});